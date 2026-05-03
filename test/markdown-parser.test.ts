import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSpec } from '../src/compiler/markdownParser';

const HEADER = `# REQ-AUTH-001 — User login

- **Type:** requirement
- **Domain:** AUTH
- **Created:** 2026-01-01T00:00:00.000Z
`;

test('parseSpec returns description=null when section is absent', () => {
  // Regression for P3: missing section must be distinguishable from
  // empty section so promote can leave prose alone vs deliberately clear.
  const md = `${HEADER}\n## Outgoing relations\n\n- **uses** → \`ENT-AUTH-USER\` — User\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.description, null);
});

test('parseSpec returns description="" when section is present but empty', () => {
  // Regression for P3: empty `## Description` body → '' (a clear), not null.
  const md = `${HEADER}\n## Description\n\n## Outgoing relations\n\n- **uses** → \`X\` — Y\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.description, '');
});

test('parseSpec captures non-empty description', () => {
  const md = `${HEADER}\n## Description\n\nThe description text.\n\n## Outgoing relations\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.description, 'The description text.');
});

test('parseSpec captures multi-line description', () => {
  const md = `${HEADER}\n## Description\n\nLine one.\n\nLine two.\n\n## Outgoing relations\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.description, 'Line one.\n\nLine two.');
});

test('parseSpec extracts id and title from H1', () => {
  const parsed = parseSpec(HEADER);
  assert.equal(parsed.id, 'REQ-AUTH-001');
  assert.equal(parsed.title, 'User login');
});

test('parseSpec flags malformed H1 as error', () => {
  const parsed = parseSpec('# not a valid heading\n');
  assert.ok(parsed.errors.length > 0);
  assert.match(parsed.errors[0], /H1/);
});

test('parseSpec extracts outgoing relations from link form', () => {
  const md = `${HEADER}\n## Outgoing relations\n\n- **uses** → [ENT-AUTH-USER](ENT-AUTH-USER.md) — User record\n- **implements** → [REQ-AUTH-001](REQ-AUTH-001.md) — Login\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.outgoing.length, 2);
  assert.deepEqual(parsed.outgoing[0], { type: 'uses', target: 'ENT-AUTH-USER' });
  assert.deepEqual(parsed.outgoing[1], { type: 'implements', target: 'REQ-AUTH-001' });
});

test('parseSpec extracts outgoing relations from code-span form', () => {
  const md = `${HEADER}\n## Outgoing relations\n\n- **uses** → \`ENT-AUTH-USER\` — User record\n`;
  const parsed = parseSpec(md);
  assert.equal(parsed.outgoing.length, 1);
  assert.deepEqual(parsed.outgoing[0], { type: 'uses', target: 'ENT-AUTH-USER' });
});
