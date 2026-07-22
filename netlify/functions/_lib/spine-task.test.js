// Alex — Recruitment Coordinator
// Unit tests for buildTaskBody. Zero external deps — run with `node --test` or
// `node --test netlify/functions/_lib/spine-task.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTaskBody } = require('./spine-task');

test('requisition open — Pending-Approval, business_critical, req: dedup_key, hr-review ref_url', () => {
  const body = buildTaskBody({
    kind: 'requisition', action: 'open', id: 'r1',
    title: 'Requisition approval: Chef — Kitchen (SFC)',
    description: '2 vacancy(ies) · Permanent · Colombo',
    approverEmail: 'sahan@esilkroute.com.lk',
  });

  assert.equal(body.source, 'atlas-recruiter');
  assert.equal(body.title, 'Requisition approval: Chef — Kitchen (SFC)');
  assert.equal(body.description, '2 vacancy(ies) · Permanent · Colombo');
  assert.deepEqual(body.assignee, { email: 'sahan@esilkroute.com.lk' });
  assert.equal(body.business_critical, true);
  assert.equal(body.status, 'Pending-Approval');
  assert.equal(body.dedup_key, 'req:r1');
  assert.equal(body.upsert, true);
  assert.equal(body.notify, true);
  assert.equal(body.ref_url, 'https://atlas-recruiter.netlify.app/hr-review.html?req=r1');
});

test('requisition resolve — outcome approved maps to Completed', () => {
  const body = buildTaskBody({ kind: 'requisition', action: 'resolve', id: 'r1', outcome: 'approved', title: 'T' });

  assert.equal(body.source, 'atlas-recruiter');
  assert.equal(body.title, 'T');
  assert.equal(body.dedup_key, 'req:r1');
  assert.equal(body.upsert, true);
  assert.equal(body.status, 'Completed');
  assert.equal(body.business_critical, undefined);
  assert.equal(body.assignee, undefined);
});

test('requisition resolve — outcome rejected maps to Cancelled', () => {
  const body = buildTaskBody({ kind: 'requisition', action: 'resolve', id: 'r1', outcome: 'rejected', title: 'T' });
  assert.equal(body.status, 'Cancelled');
  assert.equal(body.dedup_key, 'req:r1');
});

test('offer open — Pending-Approval, business_critical, offer: dedup_key, offer-letter ref_url', () => {
  const body = buildTaskBody({
    kind: 'offer', action: 'open', id: 'c1',
    title: 'Offer sign-off: Jane Doe — Chef',
    description: 'SFC · Chef',
    approverEmail: 'sahan@esilkroute.com.lk',
  });

  assert.equal(body.source, 'atlas-recruiter');
  assert.equal(body.title, 'Offer sign-off: Jane Doe — Chef');
  assert.equal(body.description, 'SFC · Chef');
  assert.deepEqual(body.assignee, { email: 'sahan@esilkroute.com.lk' });
  assert.equal(body.business_critical, true);
  assert.equal(body.status, 'Pending-Approval');
  assert.equal(body.dedup_key, 'offer:c1');
  assert.equal(body.upsert, true);
  assert.equal(body.notify, true);
  assert.equal(body.ref_url, 'https://atlas-recruiter.netlify.app/offer-letter.html?candidate=c1');
});

test('offer resolve — outcome sent (default) maps to Completed', () => {
  const body = buildTaskBody({ kind: 'offer', action: 'resolve', id: 'c1', outcome: 'sent', title: 'T2' });
  assert.equal(body.status, 'Completed');
  assert.equal(body.dedup_key, 'offer:c1');
  assert.equal(body.upsert, true);
});

test('offer resolve — outcome cancelled maps to Cancelled', () => {
  const body = buildTaskBody({ kind: 'offer', action: 'resolve', id: 'c1', outcome: 'cancelled', title: 'T2' });
  assert.equal(body.status, 'Cancelled');
});

test('unknown kind throws', () => {
  assert.throws(() => buildTaskBody({ kind: 'nope', action: 'open', id: '1', title: 'T' }));
});

test('unknown action throws', () => {
  assert.throws(() => buildTaskBody({ kind: 'requisition', action: 'nope', id: '1', title: 'T' }));
});
