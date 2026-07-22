// Alex — Recruitment Coordinator
// SPINE Pattern-C SSO bridge (Stage 1). Verifies an HMAC launch token minted by SPINE,
// finds-or-creates the matching Supabase auth user + profiles row, then mints a magiclink
// token_hash the browser can redeem via `sb.auth.verifyOtp()` (see lib/sso.js) for a real,
// RLS-respecting session. Runs server-side, so using the service-role key here is safe
// (unlike client-side pages). No npm dependencies — talks to Supabase over the same raw
// REST/Auth-admin HTTP API the other functions in this repo use.

const { verifyLaunchToken } = require('./_lib/launch-token');

const SERVER_USER_AGENT = 'Netlify-ATLAS-Recruiter/1.0';
const EXPECTED_SURFACE = 'module_atlas-recruiter';

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'User-Agent': SERVER_USER_AGENT,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// The Auth admin API has no direct "get user by email" endpoint, so we page through
// admin/users and match exactly (case-insensitive). Fine for this app's small internal
// user base (Netlify function, single page of up to 1000 users).
async function findAuthUserByEmail(email) {
  const res = await supabaseFetch('/auth/v1/admin/users?page=1&per_page=1000');
  if (!res.ok) throw new Error('Listing auth users failed');
  const data = await res.json();
  const users = Array.isArray(data?.users) ? data.users : [];
  return users.find((u) => (u.email || '').toLowerCase() === email) || null;
}

async function createAuthUser(email) {
  const res = await supabaseFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok || !data?.id) throw new Error('Creating auth user failed');
  return data;
}

function nameFromEmail(email) {
  const local = String(email).split('@')[0] || String(email);
  const spaced = local.replace(/[._-]+/g, ' ').trim();
  const titled = spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled || String(email);
}

// Upserts a profiles row only if one doesn't exist yet — never touches an existing
// profile (role or otherwise). This is what guarantees a returning user's role is
// never downgraded by a SPINE-launched sign-in.
async function ensureProfile(userId, email) {
  const findRes = await supabaseFetch(`/rest/v1/profiles?id=eq.${userId}&select=id`);
  if (!findRes.ok) throw new Error('Checking profile failed');
  const existing = await findRes.json();
  if (Array.isArray(existing) && existing.length) return;

  const createRes = await supabaseFetch('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: userId,
      full_name: nameFromEmail(email),
      email,
      role: process.env.SSO_DEFAULT_ROLE || 'hr',
    }),
  });
  if (!createRes.ok) throw new Error('Creating profile failed');
}

async function generateMagicLinkTokenHash(email) {
  const res = await supabaseFetch('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const data = await res.json();
  if (!res.ok || !data?.hashed_token) throw new Error('Generating magic link failed');
  return data.hashed_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const bridgeSecret = process.env.ATLAS_BRIDGE_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bridgeSecret || !supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SSO bridge is not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const claims = verifyLaunchToken(payload.token, bridgeSecret);
  if (!claims) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired launch token' }) };
  }
  if (claims.surface !== EXPECTED_SURFACE) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Launch token is not valid for this app' }) };
  }

  try {
    let user = await findAuthUserByEmail(claims.email);
    if (!user) {
      user = await createAuthUser(claims.email);
    }
    await ensureProfile(user.id, claims.email);

    const tokenHash = await generateMagicLinkTokenHash(claims.email);
    return { statusCode: 200, body: JSON.stringify({ email: claims.email, token_hash: tokenHash }) };
  } catch (err) {
    // Never log the launch token or the generated token_hash — both are bearer credentials.
    console.error('sso-bridge error:', err instanceof Error ? err.message : 'unknown error');
    return { statusCode: 500, body: JSON.stringify({ error: 'SSO sign-in failed' }) };
  }
};
