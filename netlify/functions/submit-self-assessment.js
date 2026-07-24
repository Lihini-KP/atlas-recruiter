// Alex — Recruitment Coordinator
// Receives a shortlisted candidate's self-assessment answers (the second, deeper
// questionnaire sent automatically once they're Shortlisted): persists them to
// Supabase in self_assessments, linked to their existing candidate record by email,
// and emails HR a copy. Runs server-side, so it's safe to use the Supabase
// service-role key here (unlike client-side pages or the Apps Script importer).

const HR_EMAIL = process.env.HR_EMAIL || 'hra@esilkroute.com.lk';
const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';

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

  const required = ['candidateName', 'candidateEmail', 'position', 'yearsExperience', 'workExperience', 'relevantSkills', 'achievement', 'whyFit'];
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

    const assessmentRes = await supabaseFetch('/rest/v1/self_assessments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ candidate_id: candidateId, answers: a }),
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

Achievement/Challenge Handled:
${a.achievement}

Why They're a Good Fit:
${a.whyFit}`;

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
