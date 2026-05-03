import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePrd } from '../src/prd/parse';
import { buildPrompt } from '../src/prd/prompt';
import { makeNode, emptyGraph } from './helpers';

function basicGraph() {
  const g = emptyGraph();
  g.nodes['REQ-AUTH-002'] = makeNode({
    id: 'REQ-AUTH-002', type: 'requirement', domain: 'AUTH',
    title: 'Passkey signin', description: 'Users authenticate via passkey',
    tags: ['auth', 'passkey']
  });
  g.nodes['API-AUTH-PASSKEY'] = makeNode({
    id: 'API-AUTH-PASSKEY', type: 'api', domain: 'AUTH',
    title: 'POST /auth/passkey', description: 'Passkey signin endpoint',
    relations: [{ type: 'implements', target: 'REQ-AUTH-002' }]
  });
  return g;
}

test('buildPrompt: section-mode emits one section block per H2', () => {
  const md = `# PRD

## Story: signup
<!-- pv-intents: REQ-AUTH-002 -->

prose

## Story: signin
<!-- pv-intents: API-AUTH-PASSKEY -->

prose
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /Section 1\/2: Story: signup/);
  assert.match(out, /Section 2\/2: Story: signin/);
});

test('buildPrompt: includes linked Intent metadata', () => {
  const md = `# PRD

## Story
<!-- pv-intents: REQ-AUTH-002 -->
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /REQ-AUTH-002/);
  assert.match(out, /Passkey signin/);
  assert.match(out, /description: Users authenticate via passkey/);
});

test('buildPrompt: whole-file mode when no section directives', () => {
  const md = `---
intents: [REQ-AUTH-002]
---

# PRD

prose without sections
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /no section directives found/);
  assert.match(out, /REQ-AUTH-002/);
});

test('buildPrompt: whole-file mode includes the actual PRD prose body', () => {
  // Regression: previously the whole-file branch jumped from "## PRD
  // content" straight to "### Linked Intents" without ever appending
  // the body, so the LLM was asked to compare prose it never saw.
  const md = `---
intents: [REQ-AUTH-002]
---

# Passwordless authentication

The product enables enterprise-grade passkey signin and a recovery
flow that avoids SMS by routing through hardware-key fallback.
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /enterprise-grade passkey signin/);
  assert.match(out, /hardware-key fallback/);
});

test('buildPrompt: whole-file body has section directives stripped', () => {
  // If the document happens to contain a directive but no H2 section
  // (so we still take the whole-file branch), the directive shouldn't
  // leak into the prompt body.
  const md = `# PRD

prose paragraph

<!-- pv-intents: REQ-AUTH-002 -->

more prose
`;
  const parsed = parsePrd(md, 'fake.md');
  // sections.length === 0 here, so whole-file mode triggers.
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /prose paragraph/);
  assert.match(out, /more prose/);
  assert.ok(!/<!-- pv-intents:/.test(out.split('## Output format')[0]));
});

test('buildPrompt: includes 1-hop neighbors by default', () => {
  const md = `# PRD

## Story
<!-- pv-intents: REQ-AUTH-002 -->
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  // API-AUTH-PASSKEY is a neighbor of REQ-AUTH-002 via incoming implements.
  assert.match(out, /API-AUTH-PASSKEY/);
  assert.match(out, /\(neighbor\)/);
});

test('buildPrompt: omits neighbors when includeNeighbors=false', () => {
  const md = `# PRD

## Story
<!-- pv-intents: REQ-AUTH-002 -->
`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {}, { includeNeighbors: false });
  assert.match(out, /REQ-AUTH-002/);
  assert.ok(!out.includes('API-AUTH-PASSKEY'));
});

test('buildPrompt: ends with output JSON spec', () => {
  const md = `# PRD\n\n## S\n<!-- pv-intents: REQ-AUTH-002 -->\n`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /## Output format/);
  assert.match(out, /missing_in_graph/);
  assert.match(out, /contradictions/);
});

test('buildPrompt: dangling reference is flagged in the section context', () => {
  const md = `# PRD\n\n## S\n<!-- pv-intents: REQ-AUTH-999 -->\n`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), {});
  assert.match(out, /REQ-AUTH-999/);
  assert.match(out, /dangling/);
});

test('buildPrompt: codemap files appear when present', () => {
  const md = `# PRD\n\n## S\n<!-- pv-intents: REQ-AUTH-002 -->\n`;
  const parsed = parsePrd(md, 'fake.md');
  const out = buildPrompt(parsed, basicGraph(), { 'REQ-AUTH-002': ['src/auth/passkey.ts'] });
  assert.match(out, /codemap: src\/auth\/passkey\.ts/);
});
