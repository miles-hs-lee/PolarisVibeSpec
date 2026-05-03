import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  renameInGraph,
  renameInCodemap,
  renameInCounters,
  replaceIdInPrd,
  runRename
} from '../src/commands/rename';
import {
  tmpRepo, writeGraph, writeCodemap, readGraph, makeNode, emptyGraph,
  muted, withCwd, expectExit
} from './helpers';

// ---------- pure helper tests ----------

test('renameInGraph: rewrites the node and updates incoming relation targets', () => {
  const g = emptyGraph();
  g.nodes['REQ-AUTH-002'] = makeNode({ id: 'REQ-AUTH-002', type: 'requirement', domain: 'AUTH' });
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
    relations: [{ type: 'implements', target: 'REQ-AUTH-002' }]
  });

  const out = renameInGraph(g, 'REQ-AUTH-002', 'REQ-AUTH-PASSKEY');

  assert.equal(out.nodes['REQ-AUTH-002'], undefined);
  assert.equal(out.nodes['REQ-AUTH-PASSKEY'].id, 'REQ-AUTH-PASSKEY');
  assert.equal(out.nodes['API-AUTH-LOGIN'].relations[0].target, 'REQ-AUTH-PASSKEY');
});

test('renameInCodemap: rewrites the entry key', () => {
  const out = renameInCodemap(
    { 'REQ-AUTH-002': ['src/auth/passkey.ts'], 'API-AUTH-LOGIN': ['src/auth/login.ts'] },
    'REQ-AUTH-002', 'REQ-AUTH-PASSKEY'
  );
  assert.deepEqual(out['REQ-AUTH-PASSKEY'], ['src/auth/passkey.ts']);
  assert.equal(out['REQ-AUTH-002'], undefined);
  assert.deepEqual(out['API-AUTH-LOGIN'], ['src/auth/login.ts']);
});

test('renameInCounters: moves the collision flag', () => {
  const { counters, collisionFlagMoved } = renameInCounters(
    { '__collision__REQ-AUTH-002': 1, 'REQ-AUTH': 5 },
    'REQ-AUTH-002', 'REQ-AUTH-PASSKEY'
  );
  assert.equal(collisionFlagMoved, true);
  assert.equal(counters['__collision__REQ-AUTH-PASSKEY'], 1);
  assert.equal(counters['__collision__REQ-AUTH-002'], undefined);
});

test('renameInCounters: numeric counter bumped when renaming to higher number', () => {
  const { counters, numericBumped } = renameInCounters(
    { 'REQ-AUTH': 2 },
    'REQ-AUTH-002', 'REQ-AUTH-008'
  );
  assert.equal(numericBumped, true);
  assert.equal(counters['REQ-AUTH'], 8);
});

test('renameInCounters: numeric counter NOT bumped for slug rename', () => {
  // REQ-AUTH-002 → REQ-AUTH-PASSKEY: new id has no numeric tail.
  const { counters, numericBumped } = renameInCounters(
    { 'REQ-AUTH': 5 },
    'REQ-AUTH-002', 'REQ-AUTH-PASSKEY'
  );
  assert.equal(numericBumped, false);
  assert.equal(counters['REQ-AUTH'], 5);
});

test('replaceIdInPrd: whole-word match only', () => {
  // REQ-AUTH-002 should match; REQ-AUTH-002X should NOT.
  const md = '- REQ-AUTH-002 is referenced.\n- REQ-AUTH-002X is unrelated.\n';
  const out = replaceIdInPrd(md, 'REQ-AUTH-002', 'REQ-AUTH-PASSKEY');
  assert.equal(out.occurrences, 1);
  assert.match(out.content, /REQ-AUTH-PASSKEY is referenced/);
  assert.match(out.content, /REQ-AUTH-002X is unrelated/);
});

test('replaceIdInPrd: replaces in frontmatter, directives, and body', () => {
  const md = `---
intents: [REQ-AUTH-002, OTHER-X]
---

## Story
<!-- pv-intents: REQ-AUTH-002 -->

Body mentions REQ-AUTH-002.
`;
  const out = replaceIdInPrd(md, 'REQ-AUTH-002', 'REQ-AUTH-PASSKEY');
  assert.equal(out.occurrences, 3);
  assert.match(out.content, /intents: \[REQ-AUTH-PASSKEY/);
  assert.match(out.content, /<!-- pv-intents: REQ-AUTH-PASSKEY/);
  assert.match(out.content, /Body mentions REQ-AUTH-PASSKEY\./);
});

// ---------- end-to-end runRename tests ----------

test('runRename: applies all changes and reports them', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-002'] = makeNode({ id: 'REQ-AUTH-002', type: 'requirement', domain: 'AUTH' });
    g.nodes['API-AUTH-LOGIN'] = makeNode({
      id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
      relations: [{ type: 'implements', target: 'REQ-AUTH-002' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, { 'REQ-AUTH-002': ['src/auth/passkey.ts'] });

    fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs', 'prd', 'CORE.md'),
      `---\nintents: [REQ-AUTH-002]\n---\n\nReferences REQ-AUTH-002.\n`
    );

    withCwd(dir, () => muted(() => runRename('REQ-AUTH-002', 'REQ-AUTH-PASSKEY')));

    const after = readGraph(dir);
    assert.ok(after.nodes['REQ-AUTH-PASSKEY']);
    assert.equal(after.nodes['REQ-AUTH-002'], undefined);
    assert.equal(after.nodes['API-AUTH-LOGIN'].relations[0].target, 'REQ-AUTH-PASSKEY');

    const codemap = JSON.parse(fs.readFileSync(path.join(dir, '.polaris', 'codemap.json'), 'utf8'));
    assert.deepEqual(codemap['REQ-AUTH-PASSKEY'], ['src/auth/passkey.ts']);

    const prd = fs.readFileSync(path.join(dir, 'docs', 'prd', 'CORE.md'), 'utf8');
    assert.match(prd, /REQ-AUTH-PASSKEY/);
    assert.ok(!prd.includes('REQ-AUTH-002'));
  } finally {
    cleanup();
  }
});

test('runRename: --dry-run does not mutate disk', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-002'] = makeNode({ id: 'REQ-AUTH-002', type: 'requirement', domain: 'AUTH' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'REQ-AUTH-002': ['src/auth/passkey.ts'] });

    withCwd(dir, () =>
      muted(() => runRename('REQ-AUTH-002', 'REQ-AUTH-PASSKEY', { dryRun: true }))
    );

    const after = readGraph(dir);
    assert.ok(after.nodes['REQ-AUTH-002'], 'old id must still be present after dry-run');
    assert.equal(after.nodes['REQ-AUTH-PASSKEY'], undefined);
  } finally {
    cleanup();
  }
});

test('runRename: refuses identical old/new id', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);

    let exitCode: number | undefined;
    withCwd(dir, () => muted(() => {
      const r = expectExit(() => runRename('REQ-X-001', 'REQ-X-001'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runRename: refuses malformed old id', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    let exitCode: number | undefined;
    withCwd(dir, () => muted(() => {
      const r = expectExit(() => runRename('not-an-id', 'REQ-X-001'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runRename: refuses malformed new id', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);

    let exitCode: number | undefined;
    withCwd(dir, () => muted(() => {
      const r = expectExit(() => runRename('REQ-X-001', 'lowercase-bad'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runRename: refuses when old id does not exist', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    let exitCode: number | undefined;
    withCwd(dir, () => muted(() => {
      const r = expectExit(() => runRename('REQ-X-001', 'REQ-X-002'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runRename: refuses when new id already exists in graph', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['REQ-X-002'] = makeNode({ id: 'REQ-X-002', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);

    let exitCode: number | undefined;
    withCwd(dir, () => muted(() => {
      const r = expectExit(() => runRename('REQ-X-001', 'REQ-X-002'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);

    // Both untouched.
    const after = readGraph(dir);
    assert.ok(after.nodes['REQ-X-001']);
    assert.ok(after.nodes['REQ-X-002']);
  } finally {
    cleanup();
  }
});

test('runRename: refuses cross-type rename (REQ → API)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-002'] = makeNode({ id: 'REQ-AUTH-002', type: 'requirement', domain: 'AUTH' });
    writeGraph(dir, g);

    let caught: Error | null = null;
    const origExit = process.exit;
    // @ts-expect-error
    process.exit = (code?: number) => {
      caught = new Error(`process.exit(${code})`);
      throw caught;
    };
    const origStderr = process.stderr.write.bind(process.stderr);
    // @ts-expect-error
    process.stderr.write = () => true;

    try {
      withCwd(dir, () => muted(() => {
        try {
          runRename('REQ-AUTH-002', 'API-AUTH-002');
        } catch {
          // expected
        }
      }));
    } finally {
      process.exit = origExit;
      process.stderr.write = origStderr;
    }

    assert.ok(caught, 'should have called process.exit');

    const after = readGraph(dir);
    assert.ok(after.nodes['REQ-AUTH-002'], 'graph must be untouched on rejected rename');
  } finally {
    cleanup();
  }
});
