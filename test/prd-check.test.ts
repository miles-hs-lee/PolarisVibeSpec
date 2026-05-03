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

// ---------- prd auto-discovery via .polaris/prd-sources.json ----------

import * as fs from 'fs';
import * as path from 'path';
import { runPrdCheck } from '../src/commands/prdCheck';
import { tmpRepo, writeGraph, withCwd, captured, expectExit } from './helpers';

test('discoverPrds: prd-sources.json with explicit files is honored', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, { version: 1, nodes: {} });
    fs.mkdirSync(path.join(dir, 'custom'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'custom', 'a.md'), '# PRD A');
    fs.writeFileSync(path.join(dir, '.polaris', 'prd-sources.json'),
      JSON.stringify({ version: 1, files: ['custom/a.md'] }));

    const { out } = withCwd(dir, () => captured(() => runPrdCheck([], {})));
    const r = JSON.parse(out);
    assert.equal(r.summary.files_checked, 1);
    assert.equal(r.files[0].path, 'custom/a.md');
  } finally {
    cleanup();
  }
});

test('discoverPrds: prd-sources.json with directories walks them', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, { version: 1, nodes: {} });
    fs.mkdirSync(path.join(dir, 'specs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'specs', 'a.md'), '# A');
    fs.writeFileSync(path.join(dir, 'specs', 'nested', 'b.md'), '# B');
    fs.writeFileSync(path.join(dir, '.polaris', 'prd-sources.json'),
      JSON.stringify({ version: 1, directories: ['specs'] }));

    const { out } = withCwd(dir, () => captured(() => runPrdCheck([], {})));
    const r = JSON.parse(out);
    assert.equal(r.summary.files_checked, 2, 'recursive walk picks up nested .md');
  } finally {
    cleanup();
  }
});

test('discoverPrds: explicit path argument fails fast on missing path', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, { version: 1, nodes: {} });

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPrdCheck(['does-not-exist.md'], {}));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('discoverPrds: fail when no PRDs found and no path passed', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, { version: 1, nodes: {} });
    // No docs/prd, no prd, no prds, no prd-sources.json.

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPrdCheck([], {}));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runPrdCheck: --prompt mode emits markdown to stdout (not JSON)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, {
      version: 1,
      nodes: {
        'REQ-X-001': {
          id: 'REQ-X-001', type: 'requirement', domain: 'X',
          title: 'Test', description: '', tags: [], relations: [],
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      }
    });
    fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs', 'prd', 'a.md'),
      '---\nintents: [REQ-X-001]\n---\n\n# PRD\n\nbody\n'
    );

    const { out } = withCwd(dir, () => captured(() => runPrdCheck([], { prompt: true })));
    assert.ok(!out.startsWith('{'), 'markdown not JSON');
    assert.match(out, /Drift check/);
    assert.match(out, /REQ-X-001/);
  } finally {
    cleanup();
  }
});

test('runPrdCheck: --strict mode reports orphan Intents and exits 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, {
      version: 1,
      nodes: {
        'REQ-X-001': {
          id: 'REQ-X-001', type: 'requirement', domain: 'X',
          title: 'Linked', description: '', tags: [], relations: [],
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        'REQ-X-002': {
          id: 'REQ-X-002', type: 'requirement', domain: 'X',
          title: 'Orphan', description: '', tags: [], relations: [],
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      }
    });
    fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs', 'prd', 'a.md'),
      '---\nintents: [REQ-X-001]\n---\n\n# PRD\n'
    );

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPrdCheck([], { strict: true }));
      exitCode = r.code;
    }));
    const r = JSON.parse(out);
    assert.equal(exitCode, 1);
    assert.deepEqual(r.orphan_intents, ['REQ-X-002']);
  } finally {
    cleanup();
  }
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
