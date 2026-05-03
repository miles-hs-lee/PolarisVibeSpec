import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePrd } from '../src/prd/parse';
import { checkPrd, findOrphanIntents } from '../src/prd/check';
import { makeNode, emptyGraph } from './helpers';

function graphWith(...ids: string[]) {
  const g = emptyGraph();
  for (const id of ids) {
    const m = id.match(/^(REQ|API|WF|ENT)-([A-Z0-9]+)-/);
    const type = m && m[1] === 'API' ? 'api'
      : m && m[1] === 'WF' ? 'workflow'
      : m && m[1] === 'ENT' ? 'entity'
      : 'requirement';
    g.nodes[id] = makeNode({ id, type, domain: m ? m[2] : 'X' });
  }
  return g;
}

test('checkPrd: all references valid → ok=true', () => {
  const md = `---
intents: [REQ-AUTH-002, API-AUTH-PASSKEY]
---

body
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-AUTH-002', 'API-AUTH-PASSKEY'));
  assert.equal(r.ok, true);
  assert.equal(r.references.length, 2);
  assert.ok(r.references.every((x) => x.status === 'ok'));
});

test('checkPrd: dangling reference → ok=false', () => {
  const md = `---
intents: [REQ-AUTH-002, REQ-AUTH-999]
---
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-AUTH-002'));
  assert.equal(r.ok, false);
  const dangling = r.references.find((x) => x.id === 'REQ-AUTH-999')!;
  assert.equal(dangling.status, 'dangling');
});

test('checkPrd: orphan PRD warning when no references', () => {
  const md = `# PRD

Just prose, no IDs.
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-X-001'));
  assert.ok(r.warnings.some((w) => w.type === 'orphan_prd'));
});

test('checkPrd: API path mention without matching node → warning', () => {
  const md = `# PRD

User signs in with POST /auth/no-such-endpoint.
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-X-001'));
  assert.ok(r.warnings.some((w) => w.type === 'unmatched_api_path'));
});

test('checkPrd: API path mention with matching node title → no warning', () => {
  const md = `# PRD

User signs in via POST /auth/passkey.
`;
  const parsed = parsePrd(md, 'fake.md');
  const g = graphWith('API-AUTH-PASSKEY');
  g.nodes['API-AUTH-PASSKEY'].title = 'POST /auth/passkey';
  const r = checkPrd(parsed, g);
  assert.ok(!r.warnings.some((w) => w.type === 'unmatched_api_path'));
});

test('findOrphanIntents: graph nodes not referenced by any PRD', () => {
  const md = `---
intents: [REQ-AUTH-002]
---
`;
  const parsed = parsePrd(md, 'fake.md');
  const g = graphWith('REQ-AUTH-002', 'REQ-AUTH-003', 'API-BILLING-CHARGE');
  const r = checkPrd(parsed, g);
  const orphans = findOrphanIntents([r], g);
  assert.deepEqual(orphans.intents.sort(), ['API-BILLING-CHARGE', 'REQ-AUTH-003']);
});

test('checkPrd: parse warnings carried through as warnings', () => {
  const md = `---
intents: not-a-list
---
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-X-001'));
  assert.ok(r.warnings.some((w) => w.type === 'parse'));
});

test('checkPrd: malformed body ids are flagged (not silently ignored)', () => {
  // Regression: malformed shapes like `REQ-PV` and `REQ-PV-` used to
  // be invisible because the body regex pre-filtered them. Now they
  // surface as status='malformed' and fail the check.
  const md = `# PRD

References REQ-PV (incomplete) and REQ-PV- (trailing hyphen).
`;
  const parsed = parsePrd(md, 'fake.md');
  const r = checkPrd(parsed, graphWith('REQ-PV-001'));
  const malformed = r.references.filter((x) => x.status === 'malformed').map((x) => x.id);
  assert.ok(malformed.includes('REQ-PV'));
  assert.ok(malformed.includes('REQ-PV-'));
  assert.equal(r.ok, false);
});
