// Alex — Recruitment Coordinator
// Emails HR with the recruitment request details and the generated advertisement attached.
// Uses Resend (https://resend.com) for transactional email. Configure RESEND_API_KEY,
// RESEND_FROM (a verified sending address) and optionally HR_EMAIL (defaults below).

const HR_EMAIL = process.env.HR_EMAIL || 'hra@esilkroute.com.lk';

function renderAdHtml(ad) {
  const list = (items) => (items || []).map((i) => `<li>${i}</li>`).join('');
  return `<html><body style="font-family:Arial,sans-serif;line-height:1.5">
    <h2>${ad.position_title}</h2>
    <p>${ad.company_intro}</p>
    <h3>Responsibilities</h3><ul>${list(ad.responsibilities)}</ul>
    <h3>Qualifications</h3><ul>${list(ad.qualifications)}</ul>
    <h3>Skills</h3><ul>${list(ad.skills)}</ul>
    <h3>Benefits</h3><ul>${list(ad.benefits)}</ul>
    <p><strong>Location:</strong> ${ad.location}</p>
    <p><strong>How to apply:</strong> ${ad.how_to_apply}</p>
  </body></html>`;
}

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

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { request, ad } = payload;
  if (!request || !ad) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request or ad in payload' }) };
  }

  const bodyText = `A new recruitment request has been created.

Position: ${request.position}
Department: ${request.department}
Hiring Manager: ${request.reportingManager || ''}
Number of Vacancies: ${request.vacancies || ''}

The attached advertisement has been automatically generated.

Please publish this vacancy on all recruitment platforms.

Recruitment Agent
ATLAS`;

  const adHtml = renderAdHtml(ad);
  const attachmentBase64 = Buffer.from(adHtml, 'utf-8').toString('base64');

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
        subject: `Recruitment Request – ${request.position}`,
        text: bodyText,
        attachments: [
          {
            filename: `${request.position.replace(/\s+/g, '_')}_Advertisement.html`,
            content: attachmentBase64,
          },
        ],
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
