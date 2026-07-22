// Alex — Recruitment Coordinator
// Client-facing proxy for ATLAS two-way approval tasks (Stage 2). The browser never
// holds APP_TASK_SECRET — it calls this function with its own Supabase session
// access_token, this function verifies that token against Supabase Auth, then
// forwards a fixed-shape request to SPINE's app-task endpoint using the secret held
// server-side only (see netlify/functions/_lib/spine-task.js).

const { buildTaskBody, postTask } = require('./_lib/spine-task');

const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';
const DEFAULT_APPROVER_EMAIL = 'sahan@esilkroute.com.lk';

// Roles allowed to fire each action. Unknown/null role falls through to neither
// list, so it's rejected by the gate below (fail closed).
const OPEN_ROLES = ['department_manager', 'hr', 'ceo', 'admin', 'interviewer'];
const RESOLVE_ROLES = ['hr', 'ceo', 'admin'];

// Verifies the caller's Supabase session token by asking Supabase Auth who it
// belongs to (raw fetch, same pattern as sso-bridge.js). apikey is only used by
// Supabase's gateway to identify the project — the service-role key already lives
// in this function's env for other calls, so no new env var is needed here.
// Returns the user object (need the id for the role lookup) on success, else null.
async function verifyCallerToken(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !accessToken) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': SERVER_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    return data;
  } catch {
    return null;
  }
}

// Looks up the caller's role from profiles (raw fetch, service-role — same pattern
// as sso-bridge.js's supabaseFetch). Returns null on any failure or missing row,
// which the gate below treats as unauthorized.
async function fetchCallerRole(userId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=role`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'User-Agent': SERVER_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0].role : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!process.env.APP_TASK_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'atlas-task is not configured' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const user = await verifyCallerToken(accessToken);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { kind, action, id, outcome, title, description } = payload;

  const role = await fetchCallerRole(user.id);
  if (action === 'resolve' && !RESOLVE_ROLES.includes(role)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'forbidden' }) };
  }
  if (action === 'open' && !OPEN_ROLES.includes(role)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'forbidden' }) };
  }

  const approverEmail = process.env.RECRUITMENT_APPROVER_EMAIL || DEFAULT_APPROVER_EMAIL;

  try {
    const body = buildTaskBody({ kind, action, id, outcome, title, description, approverEmail });
    const spine = await postTask(body);
    return { statusCode: 200, body: JSON.stringify({ ok: true, spine }) };
  } catch (err) {
    console.error('atlas-task error:', err instanceof Error ? err.message : 'unknown error');
    return { statusCode: 500, body: JSON.stringify({ error: 'atlas-task failed' }) };
  }
};
