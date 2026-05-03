import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runExportAll } from '../src/commands/exportAll';
import { tmpRepo, writeGraph, makeNode, emptyGraph } from './helpers';

function muted<T>(fn: () => T): T {
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error
  process.stdout.write = () => true;
  try {
    return fn();
  } finally {
    process.stdout.write = orig;
  }
}

function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(orig);
  }
}

test('export-all writes one file per node + README index', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    graph.nodes['ENT-X-USER'] = makeNode({ id: 'ENT-X-USER', type: 'entity', domain: 'X' });
    writeGraph(dir, graph);

    withCwd(dir, () => muted(() => runExportAll()));

    const specDir = path.join(dir, 'spec');
    assert.ok(fs.existsSync(path.join(specDir, 'REQ-X-001.md')));
    assert.ok(fs.existsSync(path.join(specDir, 'ENT-X-USER.md')));
    assert.ok(fs.existsSync(path.join(specDir, 'README.md')));
  } finally {
    cleanup();
  }
});

test('export-all removes spec/<id>.md when the node is gone from the graph', () => {
  // P2 regression: stale per-node markdown must be deleted so spec/
  // remains a faithful regenerated view, and CI's git-diff drift check
  // can actually catch deletions.
  const { dir, cleanup } = tmpRepo();
  try {
    // Step 1: write graph with both nodes, export.
    const g1 = emptyGraph();
    g1.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g1.nodes['REQ-X-002'] = makeNode({ id: 'REQ-X-002', type: 'requirement', domain: 'X' });
    writeGraph(dir, g1);
    withCwd(dir, () => muted(() => runExportAll()));

    const specDir = path.join(dir, 'spec');
    assert.ok(fs.existsSync(path.join(specDir, 'REQ-X-002.md')), 'precondition: file was written');

    // Step 2: remove REQ-X-002 from graph and re-export.
    const g2 = emptyGraph();
    g2.nodes['REQ-X-001'] = g1.nodes['REQ-X-001'];
    writeGraph(dir, g2);
    withCwd(dir, () => muted(() => runExportAll()));

    assert.equal(fs.existsSync(path.join(specDir, 'REQ-X-002.md')), false, 'stale spec file should be removed');
    assert.ok(fs.existsSync(path.join(specDir, 'REQ-X-001.md')), 'surviving node still present');
  } finally {
    cleanup();
  }
});

test('export-all does not delete user-added non-node files in spec/', () => {
  // The deletion logic must only touch files matching the node-id
  // pattern, so a user-curated spec/NOTES.md is safe.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, graph);
    withCwd(dir, () => muted(() => runExportAll()));

    const specDir = path.join(dir, 'spec');
    fs.writeFileSync(path.join(specDir, 'NOTES.md'), '# notes\n');
    fs.writeFileSync(path.join(specDir, 'CHANGELOG.md'), '# changelog\n');

    // Re-export — these files should be untouched.
    withCwd(dir, () => muted(() => runExportAll()));

    assert.ok(fs.existsSync(path.join(specDir, 'NOTES.md')));
    assert.ok(fs.existsSync(path.join(specDir, 'CHANGELOG.md')));
  } finally {
    cleanup();
  }
});

test('export-all is idempotent (running twice produces the same output)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001',
      type: 'requirement',
      domain: 'X',
      description: 'Some description.',
      tags: ['x', 'auth']
    });
    writeGraph(dir, graph);

    withCwd(dir, () => muted(() => runExportAll()));
    const first = fs.readFileSync(path.join(dir, 'spec', 'REQ-X-001.md'), 'utf8');

    withCwd(dir, () => muted(() => runExportAll()));
    const second = fs.readFileSync(path.join(dir, 'spec', 'REQ-X-001.md'), 'utf8');

    assert.equal(first, second);
  } finally {
    cleanup();
  }
});
