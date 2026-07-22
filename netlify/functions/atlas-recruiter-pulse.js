// Alex — Recruitment Coordinator
// Daily SAGE pulse (Stage 2): counts a handful of flat recruitment KPIs straight from
// Supabase (service-role, raw fetch — same pattern as sso-bridge.js's supabaseFetch)
// and reports them to ATLAS as one agent run. Scheduled via netlify.toml
// ([functions."atlas-recruiter-pulse"] schedule = "@daily") rather than the v2
// `export const config` syntax, to match this repo's plain CommonJS
// `exports.handler` function style everywhere else.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ATLAS_AGENT_TOKEN = process.env.ATLAS_AGENT_TOKEN;
const SPINE_BASE = 'https://srv-spine.netlify.app';
const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';
const AGENT_KEY = 'atlas-recruiter-pulse';

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

// Exact row count for a REST query, using Content-Range instead of fetching every
// row (Range: 0-0 asks for at most 1 row back; count=exact still returns the total).
async function countRows(path) {
  const res = await supabaseFetch(path, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`Count failed for ${path}: ${res.status}`);
  const range = res.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

async function computeKpis() {
  const today = new Date().toISOString().slice(0, 10);

  const [openReqs, candidatesPipeline, interviewsScheduled, offersOut] = await Promise.all([
    countRows('/rest/v1/recruitment_requests?status=not.in.(completed,rejected)&select=id'),
    countRows('/rest/v1/candidates?status=not.in.(hired,rejected)&select=id'),
    countRows(`/rest/v1/interviews?scheduled_date=gte.${today}&select=id`),
    countRows('/rest/v1/offers?sent_at=not.is.null&accepted=not.is.true&select=id'),
  ]);

  return {
    open_reqs: openReqs,
    candidates_pipeline: candidatesPipeline,
    interviews_scheduled: interviewsScheduled,
    offers_out: offersOut,
  };
}

// Mirrors SPINE's reportAgentRun one-shot helper (netlify/functions/_lib/agent-report.mjs
// in the spine repo): POST to atlas-agent-run?action=log with { agent_key, status,
// summary, metrics }.
async function reportRun(status, summary, metrics) {
  const res = await fetch(`${SPINE_BASE}/.netlify/functions/atlas-agent-run?action=log`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${ATLAS_AGENT_TOKEN}`,
    },
    body: JSON.stringify({ agent_key: AGENT_KEY, status, summary, metrics }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`atlas-agent-run ${res.status}: ${text}`);
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SERVICE_KEY || !ATLAS_AGENT_TOKEN) {
    console.error('atlas-recruiter-pulse: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ATLAS_AGENT_TOKEN is not configured');
    return { statusCode: 500, body: JSON.stringify({ error: 'atlas-recruiter-pulse is not configured' }) };
  }

  try {
    const metrics = await computeKpis();
    const summary = `${metrics.open_reqs} open reqs, ${metrics.candidates_pipeline} in pipeline, ` +
      `${metrics.interviews_scheduled} interviews upcoming, ${metrics.offers_out} offers out`;
    await reportRun('success', summary, metrics);
    return { statusCode: 200, body: JSON.stringify({ ok: true, metrics }) };
  } catch (err) {
    console.error('atlas-recruiter-pulse error:', err instanceof Error ? err.message : 'unknown error');
    return { statusCode: 500, body: JSON.stringify({ error: 'atlas-recruiter-pulse failed' }) };
  }
};
