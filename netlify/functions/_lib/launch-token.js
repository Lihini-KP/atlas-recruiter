// Alex — Recruitment Coordinator
// SPINE Pattern-C SSO: verifies an HMAC-signed launch token minted by SPINE when a user
// opens this app from a SPINE tile. Pure/stateless — no Supabase or network calls here,
// so it's easy to unit test (see launch-token.test.js). Used by netlify/functions/sso-bridge.js.

const crypto = require('node:crypto');

function verifyLaunchToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let obj;
  try { obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!obj?.email || !obj?.surface || !obj?.exp || now > Number(obj.exp)) return null;
  return { email: String(obj.email).toLowerCase(), surface: String(obj.surface), admin: !!obj.admin };
}

module.exports = { verifyLaunchToken };
