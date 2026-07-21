// Alex — Recruitment Coordinator
// Sends the offer letter email to a candidate. The Offer Letter tab records a
// matching row in the `offers` table itself (client-side, right after this succeeds)
// so it can show a sent-offer summary in that column.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM;
  if (!apiKey || !fromAddress) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY / RESEND_FROM is not configured' }) };
  }

  let a;
  try {
    a = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const required = ['candidateEmail', 'candidateName', 'designation', 'companyName', 'salary', 'joiningDate'];
  const missing = required.filter((f) => !a[f]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
  }

  const bodyText = `Dear ${a.candidateName},

We are pleased to offer you the position of ${a.designation} at ${a.companyName}.

Salary: ${a.salary}
Joining Date: ${a.joiningDate}
Benefits: ${a.benefits || 'To be discussed'}
Notice Period: ${a.noticePeriod || 'N/A'}
Probation: ${a.probation || 'N/A'}

Please confirm your acceptance of this offer by replying to this email.

Kind Regards
Human Resources
${a.companyName}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [a.candidateEmail],
        subject: `Offer of Employment – ${a.designation}`,
        text: bodyText,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Resend API error', detail: errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Sending offer letter failed', detail: String(err) }) };
  }
};
