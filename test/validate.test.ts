import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runValidate } from '../src/commands/validate';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

function runAndParse(dir: string, scanRoots: string[] = []) {
  let exitCode: number | undefined;
  const { out } = withCwd(dir, () => captured(() => {
    const r = expectExit(() => runValidate({ scanRoots }));
    exitCode = r.code;
  }));
  return { result: JSON.parse(out), exitCode };
}

test('runValidate: clean graph reports ok=true, errors=0', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const { result, exitCode } = runAndParse(dir);
    assert.equal(result.ok, true);
    assert.equal(result.summary.errors, 0);
    assert.equal(exitCode, undefined, 'should not exit on clean validate');
  } finally {
    cleanup();
  }
});

test('runValidate: dangling relation target → error + exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'implements', target: 'REQ-X-GHOST' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const { result, exitCode } = runAndParse(dir);
    assert.equal(result.ok, false);
    assert.equal(exitCode, 1);
    assert.ok(result.issues.some(
      (i: { kind: string }) => i.kind === 'dangling_relation'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: id mismatch (key vs node.id) → error', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    // Hand-craft graph with mismatched key.
    const graph = {
      version: 1 as const,
      nodes: {
        'REQ-X-001': {
          ...makeNode({ id: 'REQ-X-002', type: 'requirement', domain: 'X' })
        }
      }
    };
    fs.writeFileSync(path.join(dir, '.polaris', 'graph.json'), JSON.stringify(graph));
    writeCodemap(dir, {});

    const { result } = runAndParse(dir);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(
      (i: { kind: string }) => i.kind === 'id_mismatch'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: codemap entry pointing at unknown node → error', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    writeCodemap(dir, { 'REQ-X-GHOST': ['src/whatever.ts'] });

    const { result, exitCode } = runAndParse(dir);
    assert.equal(result.ok, false);
    assert.equal(exitCode, 1);
    assert.ok(result.issues.some(
      (i: { kind: string }) => i.kind === 'codemap_orphan'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: codemap path that does not exist on disk → warning (not error)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'API-X-FOO': ['src/missing.ts'] });

    const { result, exitCode } = runAndParse(dir);
    assert.equal(result.ok, true, 'missing file is warning not error');
    assert.equal(exitCode, undefined);
    assert.ok(result.issues.some(
      (i: { level: string; kind: string }) =>
        i.level === 'warning' && i.kind === 'missing_file'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: orphan source under scanRoot → warning', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, {});
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'orphan.ts'), '// uncovered');

    const { result } = runAndParse(dir, ['src']);
    assert.ok(result.issues.some(
      (i: { level: string; kind: string; message: string }) =>
        i.kind === 'orphan_source' && i.message.includes('orphan.ts')
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: scanRoots=[] disables orphan detection', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    writeCodemap(dir, {});
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'whatever.ts'), '');

    const { result } = runAndParse(dir, []);
    // scanRoots=[] should fall through to default ['src'], so we still
    // detect the orphan. Document this — passing empty doesn't disable;
    // only by passing a non-empty list of *other* dirs would it skip.
    assert.ok(result.issues.some(
      (i: { kind: string }) => i.kind === 'orphan_source'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: duplicate node id is reported as error', () => {
  // Hand-craft a malformed graph where two different keys point at nodes
  // sharing the same `id` field. The Object.entries iteration in runValidate
  // sees both, the second one trips the `ids.has(node.id)` check.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = {
      version: 1 as const,
      nodes: {
        'REQ-X-001': makeNode({ id: 'REQ-DUP', type: 'requirement', domain: 'X' }),
        'REQ-X-002': makeNode({ id: 'REQ-DUP', type: 'requirement', domain: 'X' })
      }
    };
    fs.writeFileSync(path.join(dir, '.polaris', 'graph.json'), JSON.stringify(graph));
    writeCodemap(dir, {});

    const { result, exitCode } = runAndParse(dir);
    assert.equal(result.ok, false);
    assert.equal(exitCode, 1);
    assert.ok(result.issues.some(
      (i: { kind: string }) => i.kind === 'duplicate_id'
    ));
  } finally {
    cleanup();
  }
});

test('runValidate: summary counts node_count and codemap_count', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['REQ-X-002'] = makeNode({ id: 'REQ-X-002', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'REQ-X-001': [] });

    const { result } = runAndParse(dir);
    assert.equal(result.summary.node_count, 2);
    assert.equal(result.summary.codemap_count, 1);
  } finally {
    cleanup();
  }
});
