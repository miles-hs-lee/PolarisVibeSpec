import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runExportAll } from '../src/commands/exportAll';
import { tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph } from './helpers';

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

test('export-all writes a per-domain narrative page (e.g. spec/X.md)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001', type: 'requirement', domain: 'X',
      title: 'First requirement', description: 'Some description text.'
    });
    graph.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      title: 'Foo endpoint',
      relations: [{ type: 'implements', target: 'REQ-X-001' }]
    });
    writeGraph(dir, graph);
    writeCodemap(dir, { 'API-X-FOO': ['src/x/foo.ts'] });

    withCwd(dir, () => muted(() => runExportAll()));

    const domainPath = path.join(dir, 'spec', 'X.md');
    assert.ok(fs.existsSync(domainPath), 'per-domain page exists');
    const body = fs.readFileSync(domainPath, 'utf8');
    assert.match(body, /^# X domain/m);
    // Both nodes should be inlined with sections.
    assert.match(body, /## Requirements \(1\)/);
    assert.match(body, /## APIs \(1\)/);
    assert.match(body, /REQ-X-001.*First requirement/s);
    assert.match(body, /API-X-FOO.*Foo endpoint/s);
    // Codemap files surfaced inline.
    assert.match(body, /src\/x\/foo\.ts/);
  } finally {
    cleanup();
  }
});

test('export-all README references per-domain pages, not a flat node list', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-A-001'] = makeNode({ id: 'REQ-A-001', type: 'requirement', domain: 'A' });
    g.nodes['REQ-B-001'] = makeNode({ id: 'REQ-B-001', type: 'requirement', domain: 'B' });
    writeGraph(dir, g);

    withCwd(dir, () => muted(() => runExportAll()));

    const readme = fs.readFileSync(path.join(dir, 'spec', 'README.md'), 'utf8');
    assert.match(readme, /Domain pages/, 'README has a Domain pages section');
    assert.match(readme, /\[A\]\(A\.md\)/, 'links to A.md');
    assert.match(readme, /\[B\]\(B\.md\)/, 'links to B.md');
    // Per-id index is still present but inside <details>.
    assert.match(readme, /<details>/);
  } finally {
    cleanup();
  }
});

test('export-all removes a stale per-domain page when its domain disappears', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    // Step 1: graph with two domains, generate.
    const g1 = emptyGraph();
    g1.nodes['REQ-A-001'] = makeNode({ id: 'REQ-A-001', type: 'requirement', domain: 'A' });
    g1.nodes['REQ-B-001'] = makeNode({ id: 'REQ-B-001', type: 'requirement', domain: 'B' });
    writeGraph(dir, g1);
    withCwd(dir, () => muted(() => runExportAll()));

    assert.ok(fs.existsSync(path.join(dir, 'spec', 'B.md')), 'precondition: B domain page exists');

    // Step 2: remove all B-domain nodes; B.md should be cleaned up.
    const g2 = emptyGraph();
    g2.nodes['REQ-A-001'] = g1.nodes['REQ-A-001'];
    writeGraph(dir, g2);
    withCwd(dir, () => muted(() => runExportAll()));

    assert.equal(
      fs.existsSync(path.join(dir, 'spec', 'B.md')), false,
      'stale B.md domain page removed'
    );
    assert.ok(fs.existsSync(path.join(dir, 'spec', 'A.md')), 'A.md still present');
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
