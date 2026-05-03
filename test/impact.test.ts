import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runImpact } from '../src/commands/impact';
import { classifyCoverage } from '../src/impact/analyze';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

function runAndParse(dir: string, id: string, opts: { depth?: number; filesOnly?: boolean } = {}) {
  const { out } = withCwd(dir, () => captured(() => {
    try { runImpact(id, opts); } catch { /* fail on missing root throws */ }
  }));
  return out;
}

test('runImpact: returns impacted_files from codemap entries', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'implements', target: 'REQ-X-001' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, {
      'REQ-X-001': ['src/foo/req.ts'],
      'API-X-FOO': ['src/foo/api.ts']
    });

    const r = JSON.parse(runAndParse(dir, 'REQ-X-001'));
    assert.equal(r.ok, true);
    assert.ok(r.impacted_nodes.includes('REQ-X-001'));
    assert.ok(r.impacted_nodes.includes('API-X-FOO'));
    // explicit codemap files appear in impacted_files (not inferred).
    assert.ok(r.impacted_files.some((f: string) => f.includes('req.ts')));
    assert.ok(r.impacted_files.some((f: string) => f.includes('api.ts')));
  } finally {
    cleanup();
  }
});

test('runImpact: missing node fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    writeCodemap(dir, {});

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runImpact('REQ-X-GHOST'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runImpact: --files-only emits newline-delimited paths, no JSON', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'API-X-FOO': ['src/foo/a.ts', 'src/foo/b.ts'] });

    const out = runAndParse(dir, 'API-X-FOO', { filesOnly: true });
    assert.ok(!out.startsWith('{'), 'should not be JSON');
    const lines = out.trim().split('\n');
    assert.deepEqual(lines.sort(), ['src/foo/a.ts', 'src/foo/b.ts'].sort());
  } finally {
    cleanup();
  }
});

test('runImpact: depth=0 returns just the root', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'implements', target: 'REQ-X-001' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const r = JSON.parse(runAndParse(dir, 'REQ-X-001', { depth: 0 }));
    assert.deepEqual(r.impacted_nodes, ['REQ-X-001']);
  } finally {
    cleanup();
  }
});

test('runImpact: warnings for dangling relation targets', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'affects', target: 'GHOST' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const r = JSON.parse(runAndParse(dir, 'API-X-FOO'));
    assert.ok(r.warnings.some((w: string) => /Dangling target/.test(w)));
  } finally {
    cleanup();
  }
});

// classifyCoverage is a pure function — test the thresholds directly.
test('classifyCoverage: < 25% is narrow', () => {
  assert.equal(classifyCoverage(2, 10), 'narrow');
  assert.equal(classifyCoverage(0, 10), 'narrow');
  assert.equal(classifyCoverage(2, 9), 'narrow'); // 22%
});

test('classifyCoverage: 25-60% is broad', () => {
  assert.equal(classifyCoverage(3, 10), 'broad'); // 30%
  assert.equal(classifyCoverage(6, 10), 'broad'); // 60%
});

test('classifyCoverage: > 60% is global', () => {
  assert.equal(classifyCoverage(7, 10), 'global'); // 70%
  assert.equal(classifyCoverage(10, 10), 'global');
});

test('classifyCoverage: empty graph is narrow (no division by zero)', () => {
  assert.equal(classifyCoverage(0, 0), 'narrow');
});
