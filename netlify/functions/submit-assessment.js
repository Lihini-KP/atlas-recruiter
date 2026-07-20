// Alex — Recruitment Coordinator
// Receives a candidate's assessment answers: persists them to Supabase (linked to
// their candidate record by email, creating one if it doesn't exist yet) and emails
// HR a copy. Runs server-side, so it's safe to use the Supabase service-role key here
// (unlike client-side pages or the Apps Script importer).

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
  if (!resendKey || !fromAddress) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY / RESEND_FROM is not configured' }) };
  }
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured' }) };
  }

  let a;
  try {
    a = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const required = ['candidateName', 'candidateEmail', 'position', 'currentlyEmployed', 'expectedSalary', 'availableFrom', 'willingLocation'];
  const missing = required.filter((f) => !a[f]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
  }

  try {
    // Find (or create) the candidate this assessment belongs to, matched by email.
    const findRes = await supabaseFetch(
      `/rest/v1/candidates?email=eq.${encodeURIComponent(a.candidateEmail)}&select=id&order=applied_at.desc&limit=1`
    );
    const found = await findRes.json();

    let candidateId = Array.isArray(found) && found.length ? found[0].id : null;

    if (!candidateId) {
      const createRes = await supabaseFetch('/rest/v1/candidates', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          full_name: a.candidateName,
          email: a.candidateEmail,
          status: 'assessment_completed',
          source: 'assessment_form',
          source_subject: a.position,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        return { statusCode: 502, body: JSON.stringify({ error: 'Creating candidate failed', detail: created }) };
      }
      candidateId = created[0].id;
    } else {
      await supabaseFetch(`/rest/v1/candidates?id=eq.${candidateId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'assessment_completed' }),
      });
    }

    const assessmentRes = await supabaseFetch('/rest/v1/assessments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ candidate_id: candidateId, answers: a }),
    });
    if (!assessmentRes.ok) {
      const detail = await assessmentRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Saving assessment failed', detail }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Saving assessment to database failed', detail: String(err) }) };
  }

  const bodyText = `${a.position}

${a.candidateName}
${a.candidateEmail}

Current Employment: ${a.currentlyEmployed}
Notice Period: ${a.currentlyEmployed === 'Yes' ? (a.noticePeriod || 'Not specified') : 'N/A'}
Salary Expectation: ${a.expectedSalary}
Available From: ${a.availableFrom}
Willing to work at office location: ${a.willingLocation}`;

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
        subject: `Candidate Assessment – ${a.candidateName} – ${a.position}`,
        text: bodyText,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Resend API error', detail: errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Sending HR email failed', detail: String(err) }) };
  }
};
