// Alex — Recruitment Coordinator
// Unit tests for verifyLaunchToken. Zero external deps — run with `node --test` or
// `node --test netlify/functions/_lib/launch-token.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyLaunchToken } = require('./launch-token');

const SECRET = 'test-only-secret-do-not-use-in-prod';

function mintToken(claims, secret = SECRET) {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

test('valid token verifies and returns lowercased email/surface + admin flag', () => {
  const now = Date.now();
  const token = mintToken({ email: 'Alice@Example.COM', surface: 'module_atlas-recruiter', exp: now + 60_000, admin: true });

  const claims = verifyLaunchToken(token, SECRET, now);

  assert.deepEqual(claims, { email: 'alice@example.com', surface: 'module_atlas-recruiter', admin: true });
});

test('tampered signature is rejected', () => {
  const now = Date.now();
  const token = mintToken({ email: 'bob@example.com', surface: 'module_atlas-recruiter', exp: now + 60_000 });
  const [payload, sig] = token.split('.');
  const tamperedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1); // flip one char, same length
  const tampered = `${payload}.${tamperedSig}`;

  assert.equal(verifyLaunchToken(tampered, SECRET, now), null);
});

test('expired token is rejected', () => {
  const now = Date.now();
  const token = mintToken({ email: 'carol@example.com', surface: 'module_atlas-recruiter', exp: now - 1000 });

  assert.equal(verifyLaunchToken(token, SECRET, now), null);
});

test('malformed token (no dot) is rejected', () => {
  assert.equal(verifyLaunchToken('not-a-real-token', SECRET), null);
  assert.equal(verifyLaunchToken('.leading-dot-only', SECRET), null);
  assert.equal(verifyLaunchToken('trailing-dot-only.', SECRET), null);
});

test('missing token or secret is rejected', () => {
  assert.equal(verifyLaunchToken('', SECRET), null);
  assert.equal(verifyLaunchToken('a.b', ''), null);
});
