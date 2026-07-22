// Alex — Recruitment Coordinator
// Pure body-builder + raw-fetch poster for SPINE's app-task endpoint (Stage 2 —
// ATLAS two-way approval tasks for requisitions and offers). buildTaskBody has no
// side effects, so it's trivially unit-testable with `node --test`
// (see spine-task.test.js); postTask does the actual HTTP call, same raw-fetch
// pattern used by sso-bridge.js's supabaseFetch.

const SPINE_BASE = 'https://srv-spine.netlify.app';
const APP_BASE_URL = 'https://atlas-recruiter.netlify.app';
const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';

// Builds the exact JSON body app-task expects for each (kind, action) combination.
// `outcome` only matters for action:'resolve' (requisition: 'approved'|'rejected';
// offer: 'sent'|'cancelled').
function buildTaskBody({ kind, action, id, outcome, title, description, approverEmail }) {
  if (kind === 'requisition' && action === 'open') {
    return {
      source: 'atlas-recruiter',
      title,
      description,
      assignee: { email: approverEmail },
      business_critical: true,
      status: 'Pending-Approval',
      dedup_key: `req:${id}`,
      upsert: true,
      notify: true,
      ref_url: `${APP_BASE_URL}/hr-review.html?req=${id}`,
    };
  }

  if (kind === 'requisition' && action === 'resolve') {
    return {
      source: 'atlas-recruiter',
      title,
      dedup_key: `req:${id}`,
      upsert: true,
      status: outcome === 'approved' ? 'Completed' : 'Cancelled',
    };
  }

  if (kind === 'offer' && action === 'open') {
    return {
      source: 'atlas-recruiter',
      title,
      description,
      assignee: { email: approverEmail },
      business_critical: true,
      status: 'Pending-Approval',
      dedup_key: `offer:${id}`,
      upsert: true,
      notify: true,
      ref_url: `${APP_BASE_URL}/offer-letter.html?candidate=${id}`,
    };
  }

  if (kind === 'offer' && action === 'resolve') {
    return {
      source: 'atlas-recruiter',
      title,
      dedup_key: `offer:${id}`,
      upsert: true,
      status: outcome === 'cancelled' ? 'Cancelled' : 'Completed',
    };
  }

  throw new Error(`spine-task: unknown kind/action combination "${kind}/${action}"`);
}

// POSTs a body built by buildTaskBody to SPINE's app-task endpoint. Server-side only
// (reads APP_TASK_SECRET) — never call this from client code.
async function postTask(body) {
  const secret = process.env.APP_TASK_SECRET;
  const res = await fetch(`${SPINE_BASE}/.netlify/functions/app-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': secret,
      'User-Agent': SERVER_USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) throw new Error(`app-task ${res.status}: ${text}`);
  return data;
}

module.exports = { buildTaskBody, postTask, SPINE_BASE, APP_BASE_URL };
