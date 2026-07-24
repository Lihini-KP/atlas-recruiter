// Alex — Recruitment Coordinator
// Receives a shortlisted candidate's self-assessment answers (the second, deeper
// questionnaire sent automatically once they're Shortlisted): persists them to
// Supabase in self_assessments, linked to their existing candidate record by email,
// and emails HR a copy. Runs server-side, so it's safe to use the Supabase
// service-role key here (unlike client-side pages or the Apps Script importer).

const HR_EMAIL = process.env.HR_EMAIL || 'hra@esilkroute.com.lk';
const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'User-Agent': SERVER_USER_AGENT,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// Best-effort AI scoring (0-100) of the self assessment answers against the position —
// wrapped so a Claude hiccup never blocks saving the actual answers. Returns null (not
// a number) on any failure, which the caller stores as-is; the UI shows "—" for null.
async function scoreSelfAssessment(a) {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content:
              `A candidate applying for the position of "${a.position}" submitted this self assessment. ` +
              'Score it from 0 to 100 on how strong a fit it shows for that position, considering relevant ' +
              'experience/skills depth, whether examples given are concrete and specific, and overall communication ' +
              'quality. Return ONLY valid JSON (no markdown fences) of this exact shape: {"mark": number}.\n\n' +
              `Years of experience: ${a.yearsExperience}\n` +
              `Work experience: ${a.workExperience}\n` +
              `Relevant skills: ${a.relevantSkills}\n` +
              `Certifications: ${a.certifications || 'None'}\n` +
              `Tools/machinery/software: ${a.toolsProficiency}\n` +
              `Handling pressure: ${a.workUnderPressure}\n` +
              `Teamwork: ${a.teamwork}\n` +
              `Achievement/challenge: ${a.achievement}\n` +
              `Why a good fit: ${a.whyFit}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data.content?.[0]?.text || '{}';
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonText);
    const mark = Number(parsed.mark);
    return Number.isFinite(mark) ? Math.max(0, Math.min(100, mark)) : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured' }) };
  }

  let a;
  try {
    a = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const required = ['candidateName', 'candidateEmail', 'position', 'yearsExperience', 'workExperience', 'relevantSkills', 'toolsProficiency', 'workUnderPressure', 'teamwork', 'achievement', 'whyFit'];
  const missing = required.filter((f) => !a[f]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
  }

  let candidateId;
  try {
    const findRes = await supabaseFetch(
      `/rest/v1/candidates?email=eq.${encodeURIComponent(a.candidateEmail)}&select=id&order=applied_at.desc&limit=1`
    );
    const found = await findRes.json();
    candidateId = Array.isArray(found) && found.length ? found[0].id : null;

    if (!candidateId) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No candidate found for this email — self assessment links are only sent to existing shortlisted candidates.' }) };
    }

    const mark = await scoreSelfAssessment(a);

    const assessmentRes = await supabaseFetch('/rest/v1/self_assessments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ candidate_id: candidateId, answers: a, mark }),
    });
    if (!assessmentRes.ok) {
      const detail = await assessmentRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Saving self assessment failed', detail }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Saving self assessment to database failed', detail: String(err) }) };
  }

  if (!resendKey || !fromAddress) {
    // HR notification email is best-effort — the self assessment itself is already saved above.
    return { statusCode: 200, body: JSON.stringify({ ok: true, hrNotified: false }) };
  }

  const bodyText = `${a.position}

${a.candidateName}
${a.candidateEmail}

Years of Relevant Experience: ${a.yearsExperience}

Relevant Work Experience:
${a.workExperience}

Relevant Knowledge/Skills:
${a.relevantSkills}

Certifications/Training:
${a.certifications || 'Not specified'}

Tools/Machinery/Software Proficiency:
${a.toolsProficiency}

Handling Pressure/Deadlines:
${a.workUnderPressure}

Teamwork:
${a.teamwork}

Achievement/Challenge Handled:
${a.achievement}

Why They're a Good Fit:
${a.whyFit}

References:
${a.references || 'Not provided'}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [HR_EMAIL],
        subject: `Self Assessment – ${a.candidateName} – ${a.position}`,
        text: bodyText,
      }),
    });

    if (!res.ok) {
      // Same reasoning as above — the record is already saved, so don't fail the request.
      return { statusCode: 200, body: JSON.stringify({ ok: true, hrNotified: false }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, hrNotified: true }) };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ ok: true, hrNotified: false }) };
  }
};
