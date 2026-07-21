// Alex — Recruitment Coordinator
// Reads a candidate's CV from Supabase Storage and asks Claude to extract fields the
// assessment form doesn't capture: location, education, experience. Runs server-side,
// so using the Supabase service-role key here is safe (unlike client-side pages).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';

async function supabaseFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'User-Agent': SERVER_USER_AGENT,
      ...(options.headers || {}),
    },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY is not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { candidateId } = payload;
  if (!candidateId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing candidateId' }) };
  }

  const candRes = await supabaseFetch(`/rest/v1/candidates?id=eq.${candidateId}&select=cv_storage_path`);
  const candidates = await candRes.json();
  const cvPath = candidates?.[0]?.cv_storage_path;
  if (!cvPath) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No CV on file for this candidate' }) };
  }

  const ext = cvPath.split('.').pop().toLowerCase();
  if (ext !== 'pdf') {
    return { statusCode: 422, body: JSON.stringify({ error: `Only PDF CVs can be auto-analyzed right now (this one is .${ext})` }) };
  }

  const fileRes = await supabaseFetch(`/storage/v1/object/cvs/${cvPath}`);
  if (!fileRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not download CV file' }) };
  }
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
  const base64Pdf = fileBuffer.toString('base64');

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
              {
                type: 'text',
                text: 'Read this CV and return ONLY valid JSON (no markdown fences), with this exact shape: {"location": string, "education": string, "experience_summary": string}. "location" is the candidate\'s current city/area if stated, else "Not specified". "education" is their highest or most relevant qualification, one line. "experience_summary" is a one-sentence summary of their relevant work experience (role types and total years if inferable).',
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const detail = await claudeRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Claude API error', detail }) };
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '{}';
    const extracted = JSON.parse(text);

    const updateRes = await supabaseFetch(`/rest/v1/candidates?id=eq.${candidateId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        location: extracted.location,
        education: extracted.education,
        experience_summary: extracted.experience_summary,
        cv_analyzed_at: new Date().toISOString(),
      }),
    });
    const updated = await updateRes.json();
    if (!updateRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Saving analysis failed', detail: updated }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, candidate: updated[0] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'CV analysis failed', detail: String(err) }) };
  }
};
