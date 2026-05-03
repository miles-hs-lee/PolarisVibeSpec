import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePrd } from '../src/prd/parse';

test('parsePrd extracts frontmatter intents in flow style', () => {
  const md = `---
id: PRD-AUTH-PASSKEY
title: Passwordless auth
intents: [REQ-AUTH-001, "API-AUTH-PASSKEY"]
---

# PRD body
`;
  const p = parsePrd(md, 'fake.md');
  assert.equal(p.hasFrontmatter, true);
  assert.equal(p.frontmatterId, 'PRD-AUTH-PASSKEY');
  assert.equal(p.frontmatterTitle, 'Passwordless auth');
  assert.deepEqual(p.frontmatterIntents, ['REQ-AUTH-001', 'API-AUTH-PASSKEY']);
});

test('parsePrd extracts frontmatter intents in block style', () => {
  const md = `---
intents:
  - REQ-AUTH-001
  - API-AUTH-PASSKEY
  - WF-AUTH-LOGIN
---

body
`;
  const p = parsePrd(md, 'fake.md');
  assert.deepEqual(p.frontmatterIntents, ['REQ-AUTH-001', 'API-AUTH-PASSKEY', 'WF-AUTH-LOGIN']);
});

test('parsePrd survives missing or unrecognized intents in frontmatter', () => {
  const md = `---
title: foo
intents: not-a-list
---
body
`;
  const p = parsePrd(md, 'fake.md');
  assert.deepEqual(p.frontmatterIntents, []);
  assert.ok(p.parseWarnings.some((w) => /intents/.test(w)));
});

test('parsePrd extracts body IDs with line numbers', () => {
  const md = `# PRD

This refers to REQ-AUTH-002 in line 3.

And here is API-AUTH-PASSKEY mentioned later.
`;
  const p = parsePrd(md, 'fake.md');
  const ids = p.references.map((r) => r.id).sort();
  assert.deepEqual(ids, ['API-AUTH-PASSKEY', 'REQ-AUTH-002']);
  const reqRef = p.references.find((r) => r.id === 'REQ-AUTH-002')!;
  assert.equal(reqRef.source, 'body');
  assert.ok(reqRef.line && reqRef.line >= 1);
});

test('parsePrd: frontmatter takes priority over body for the same ID', () => {
  const md = `---
intents: [REQ-AUTH-002]
---

REQ-AUTH-002 also appears in body.
`;
  const p = parsePrd(md, 'fake.md');
  const ref = p.references.find((r) => r.id === 'REQ-AUTH-002')!;
  assert.equal(ref.source, 'frontmatter');
});

test('parsePrd splits H2 sections and extracts pv-intents directives', () => {
  const md = `# PRD

## Story: enterprise admin

prose

<!-- pv-intents: API-AUTH-CONFIG, REQ-AUTH-003 -->
<!-- pv-claim: enterprise-admin -->

## Story: end user

more prose

<!-- pv-intents: API-AUTH-PASSKEY-SIGNUP -->
`;
  const p = parsePrd(md, 'fake.md');
  assert.equal(p.sections.length, 2);
  assert.equal(p.sections[0].heading, 'Story: enterprise admin');
  assert.deepEqual(p.sections[0].intents, ['API-AUTH-CONFIG', 'REQ-AUTH-003']);
  assert.equal(p.sections[0].claim, 'enterprise-admin');
  assert.deepEqual(p.sections[1].intents, ['API-AUTH-PASSKEY-SIGNUP']);
});

test('parsePrd: section directives become section-source references', () => {
  const md = `# PRD

## Section A
<!-- pv-intents: REQ-X-001 -->

## Section B
<!-- pv-intents: REQ-X-002 -->
`;
  const p = parsePrd(md, 'fake.md');
  const refs = p.references.sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(refs.length, 2);
  assert.equal(refs[0].source, 'section');
  assert.equal(refs[0].section, 'Section A');
  assert.equal(refs[1].source, 'section');
});

test('parsePrd extracts API path mentions with line numbers', () => {
  const md = `# PRD

User signs in via POST /auth/passkey to receive a token.

The recovery flow is GET /auth/recovery/{id}.
`;
  const p = parsePrd(md, 'fake.md');
  assert.equal(p.apiPathMentions.length, 2);
  assert.equal(p.apiPathMentions[0].verb, 'POST');
  assert.equal(p.apiPathMentions[0].path, '/auth/passkey');
});

test('parsePrd: PRD with no frontmatter and no IDs has empty references', () => {
  const md = `# PRD

Just some prose. No links anywhere.
`;
  const p = parsePrd(md, 'fake.md');
  assert.equal(p.hasFrontmatter, false);
  assert.equal(p.references.length, 0);
});

test('parsePrd: section without directives still parses, intents empty', () => {
  const md = `# PRD

## Some heading

prose with no directives
`;
  const p = parsePrd(md, 'fake.md');
  assert.equal(p.sections.length, 1);
  assert.deepEqual(p.sections[0].intents, []);
});
