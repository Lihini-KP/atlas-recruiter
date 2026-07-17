// Alex — Recruitment Coordinator
// Receives a candidate's assessment answers. Until Supabase is connected to persist
// candidate profiles, this forwards the answers to HR by email as an interim record.

const HR_EMAIL = process.env.HR_EMAIL || 'hra@esilkroute.com.lk';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM;
  if (!apiKey || !fromAddress) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'RESEND_API_KEY / RESEND_FROM is not configured' }),
    };
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
        authorization: `Bearer ${apiKey}`,
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Submitting assessment failed', detail: String(err) }) };
  }
};
