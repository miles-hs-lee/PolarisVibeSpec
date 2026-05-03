import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runWhy } from '../src/commands/why';
import { runHealth } from '../src/commands/health';
import { runStats } from '../src/commands/stats';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured
} from './helpers';

// ---------- pv why ----------

test('runWhy: returns matching nodes for a codemapped file', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-001'] = makeNode({ id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH' });
    g.nodes['API-AUTH-LOGIN'] = makeNode({
      id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
      relations: [{ type: 'implements', target: 'REQ-AUTH-001' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, { 'API-AUTH-LOGIN': ['src/auth/login.ts'] });

    const { out } = withCwd(dir, () => captured(() => runWhy('src/auth/login.ts')));
    const r = JSON.parse(out);
    assert.equal(r.matches.length, 1);
    assert.equal(r.matches[0].id, 'API-AUTH-LOGIN');
    assert.equal(r.matches[0].outgoing[0].target, 'REQ-AUTH-001');
  } finally {
    cleanup();
  }
});

test('runWhy: empty matches returns hint', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    writeCodemap(dir, {});

    const { out } = withCwd(dir, () => captured(() => runWhy('src/nothing.ts')));
    const r = JSON.parse(out);
    assert.deepEqual(r.matches, []);
    assert.match(r.hint, /pv add-file/);
  } finally {
    cleanup();
  }
});

test('runWhy: normalizes ./prefix and backslash separators', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'API-X-FOO': ['src/foo.ts'] });

    const { out } = withCwd(dir, () => captured(() => runWhy('./src\\foo.ts')));
    const r = JSON.parse(out);
    assert.equal(r.matches.length, 1);
  } finally {
    cleanup();
  }
});

test('runWhy: returns multiple matches when one file is in multiple codemap entries', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-A'] = makeNode({ id: 'API-X-A', type: 'api', domain: 'X' });
    g.nodes['WF-X-B'] = makeNode({ id: 'WF-X-B', type: 'workflow', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, { 'API-X-A': ['src/shared.ts'], 'WF-X-B': ['src/shared.ts'] });

    const { out } = withCwd(dir, () => captured(() => runWhy('src/shared.ts')));
    const r = JSON.parse(out);
    assert.equal(r.matches.length, 2);
  } finally {
    cleanup();
  }
});

// ---------- pv health ----------

test('runHealth: reports node/edge counts on empty graph', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    writeCodemap(dir, {});

    const { out } = withCwd(dir, () => captured(() => runHealth()));
    const r = JSON.parse(out);
    assert.equal(r.summary.total_nodes, 0);
    assert.equal(r.summary.total_edges, 0);
    assert.equal(r.summary.codemap_entries, 0);
  } finally {
    cleanup();
  }
});

test('runHealth: counts edges across all nodes', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['A'] = makeNode({ id: 'A', type: 'requirement', domain: 'X' });
    g.nodes['B'] = makeNode({
      id: 'B', type: 'api', domain: 'X',
      relations: [{ type: 'implements', target: 'A' }, { type: 'uses', target: 'A' }]
    });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const { out } = withCwd(dir, () => captured(() => runHealth()));
    const r = JSON.parse(out);
    assert.equal(r.summary.total_edges, 2);
    assert.equal(r.summary.avg_out_degree, 1);
  } finally {
    cleanup();
  }
});

test('runHealth: flags isolated nodes', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['ISOLATED'] = makeNode({ id: 'ISOLATED', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, {});

    const { out } = withCwd(dir, () => captured(() => runHealth()));
    const r = JSON.parse(out);
    assert.equal(r.summary.isolated_nodes, 1);
    assert.deepEqual(r.isolated_nodes_list, ['ISOLATED']);
  } finally {
    cleanup();
  }
});

test('runHealth: flags low codemap coverage as a high-severity issue', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    writeCodemap(dir, {});
    fs.mkdirSync(path.join(dir, 'src'));
    for (const name of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) {
      fs.writeFileSync(path.join(dir, 'src', name), '');
    }

    const { out } = withCwd(dir, () => captured(() => runHealth()));
    const r = JSON.parse(out);
    assert.ok(r.summary.codemap_coverage !== null);
    assert.ok(r.summary.codemap_coverage < 0.5);
    assert.ok(r.issues.some((i: { level: string }) => i.level === 'high'));
  } finally {
    cleanup();
  }
});

// ---------- pv stats ----------

test('runStats: empty usage log returns "no data" message', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () => captured(() => runStats()));
    const r = JSON.parse(out);
    assert.equal(r.total, 0);
    assert.match(r.message, /No.*usage.*logged/);
  } finally {
    cleanup();
  }
});

test('runStats: aggregates by recommendation/shape/coverage', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    fs.writeFileSync(
      path.join(dir, '.polaris', 'usage.jsonl'),
      [
        { ts: '2026-04-01T00:00:00Z', intent: 'a', recommendation: 'use_pv', shape: 'feature', coverage: 'narrow', impacted_count: 3, total_nodes: 10, read_set_ratio: 0.1 },
        { ts: '2026-04-02T00:00:00Z', intent: 'b', recommendation: 'use_grep', shape: 'rename', coverage: null, impacted_count: 0, total_nodes: 10, read_set_ratio: null },
        { ts: '2026-04-03T00:00:00Z', intent: 'c', recommendation: 'use_pv', shape: 'feature', coverage: 'broad', impacted_count: 5, total_nodes: 10, read_set_ratio: 0.3 }
      ].map((e) => JSON.stringify(e)).join('\n') + '\n'
    );

    const { out } = withCwd(dir, () => captured(() => runStats()));
    const r = JSON.parse(out);
    assert.equal(r.total, 3);
    assert.equal(r.by_recommendation.use_pv, 2);
    assert.equal(r.by_recommendation.use_grep, 1);
    assert.equal(r.by_shape.feature, 2);
    assert.equal(r.avg_impacted_files, 4); // (3+5)/2
    assert.equal(r.avg_read_set_ratio, 0.2); // (0.1+0.3)/2
  } finally {
    cleanup();
  }
});

test('runStats: --since filter excludes earlier entries', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    fs.writeFileSync(
      path.join(dir, '.polaris', 'usage.jsonl'),
      [
        { ts: '2026-04-01T00:00:00Z', intent: 'old', recommendation: 'use_pv', shape: 'feature', coverage: 'narrow', impacted_count: 1, total_nodes: 1, read_set_ratio: 0.1 },
        { ts: '2026-05-01T00:00:00Z', intent: 'new', recommendation: 'use_pv', shape: 'feature', coverage: 'narrow', impacted_count: 1, total_nodes: 1, read_set_ratio: 0.1 }
      ].map((e) => JSON.stringify(e)).join('\n') + '\n'
    );

    const { out } = withCwd(dir, () =>
      captured(() => runStats({ since: '2026-04-15' }))
    );
    const r = JSON.parse(out);
    assert.equal(r.total, 1);
  } finally {
    cleanup();
  }
});
