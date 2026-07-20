// Alex Recruitment Agent — sends the candidate acknowledgement + assessment-form
// email once HR assigns an (emailed-in or portal) CV to a specific open position —
// that's the first point the company/designation are known for certain.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM;
  if (!apiKey || !fromAddress) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY / RESEND_FROM is not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { candidateName, candidateEmail, designation, companyName, assessmentUrl } = payload;
  const required = { candidateEmail, designation, companyName, assessmentUrl };
  const missing = Object.keys(required).filter((k) => !required[k]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
  }

  const name = candidateName || 'Applicant';
  const bodyText = `Dear ${name},

Thank you for applying for the position of ${designation} at ${companyName}.

We have successfully received your application.

As the next step, please complete our short Candidate Assessment Form using the link below:
${assessmentUrl}

This information helps us process your application faster.

Thank you again for your interest in joining our team.

Kind Regards
Human Resources
${companyName}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [candidateEmail],
        subject: 'Thank You for Applying',
        text: bodyText,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Resend API error', detail: errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Sending thank-you email failed', detail: String(err) }) };
  }
};
