// Alex — Recruitment Coordinator
// Turns a recruitment request into a professional job advertisement using Claude,
// plus platform-formatted variants for LinkedIn, TopJobs, XpressJobs, Facebook Jobs
// and the company careers page.

const COMPANY_CONTEXT = `Silk Foods Ceylon (Pvt) Ltd is part of the Silk Route Ventures group,
a Sri Lankan company operating across food manufacturing, plantation and export businesses.`;

const PLATFORMS = ['linkedin', 'topjobs', 'xpressjobs', 'facebook_jobs', 'careers_page'];

const SYSTEM_PROMPT = `You are Alex, the AI Recruitment Coordinator for Silk Foods Ceylon (Pvt) Ltd.
Given a recruitment request, write a professional job advertisement and return ONLY valid JSON
matching this exact shape, no markdown fences, no commentary:

{
  "company_intro": string,
  "position_title": string,
  "responsibilities": string[],
  "qualifications": string[],
  "skills": string[],
  "benefits": string[],
  "location": string,
  "how_to_apply": string,
  "platform_variants": {
    "linkedin": string,
    "topjobs": string,
    "xpressjobs": string,
    "facebook_jobs": string,
    "careers_page": string
  }
}

Rules:
- company_intro: 2-3 sentences, warm and professional, based on the company context given.
- responsibilities/qualifications/skills/benefits: concise bullet strings, 4-8 items each.
- platform_variants: each is the FULL ad text formatted and toned for that specific platform
  (LinkedIn: professional, slightly longer; TopJobs/XpressJobs: structured Sri Lankan job-board
  style with clear headers; Facebook Jobs: friendly and concise; careers_page: complete formal
  posting suitable for a company website).
- Never invent salary figures if none were given.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }) };
  }

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const required = ['department', 'position', 'jobDescription'];
  const missing = required.filter((f) => !request[f]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
  }

  const userPrompt = `Company context:\n${COMPANY_CONTEXT}\n\nRecruitment request:\n${JSON.stringify(request, null, 2)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Claude API error', detail: errText }) };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const ad = JSON.parse(text);

    for (const p of PLATFORMS) {
      if (!ad.platform_variants?.[p]) {
        return { statusCode: 502, body: JSON.stringify({ error: `Model response missing platform variant: ${p}` }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ request, ad }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Ad generation failed', detail: String(err) }) };
  }
};
