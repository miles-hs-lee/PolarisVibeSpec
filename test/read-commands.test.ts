import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runShow } from '../src/commands/show';
import { runList } from '../src/commands/list';
import { runQuery } from '../src/commands/query';
import {
  tmpRepo, writeGraph, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

function setup(dir: string) {
  const g = emptyGraph();
  g.nodes['REQ-AUTH-001'] = makeNode({
    id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH',
    title: 'Login with email', description: 'Email password login',
    tags: ['auth', 'login']
  });
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
    title: 'POST /auth/login',
    relations: [{ type: 'implements', target: 'REQ-AUTH-001' }]
  });
  g.nodes['REQ-BILLING-001'] = makeNode({
    id: 'REQ-BILLING-001', type: 'requirement', domain: 'BILLING',
    title: 'Invoice generation', tags: ['billing']
  });
  writeGraph(dir, g);
}

// ---------- show ----------

test('runShow: returns node + incoming relations', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runShow('REQ-AUTH-001')));
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    assert.equal(r.node.id, 'REQ-AUTH-001');
    assert.equal(r.incoming.length, 1);
    assert.equal(r.incoming[0].from, 'API-AUTH-LOGIN');
    assert.equal(r.incoming[0].type, 'implements');
  } finally {
    cleanup();
  }
});

test('runShow: missing node fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runShow('REQ-X-GHOST'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runShow: node with no incoming returns empty array', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runShow('REQ-BILLING-001')));
    const r = JSON.parse(out);
    assert.deepEqual(r.incoming, []);
  } finally {
    cleanup();
  }
});

// ---------- list ----------

test('runList: lists all nodes when no filter', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runList()));
    const r = JSON.parse(out);
    assert.equal(r.total, 3);
    assert.equal(r.nodes.length, 3);
  } finally {
    cleanup();
  }
});

test('runList: filters by type', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runList({ type: 'requirement' })));
    const r = JSON.parse(out);
    assert.equal(r.total, 2);
    assert.ok(r.nodes.every((n: { type: string }) => n.type === 'requirement'));
  } finally {
    cleanup();
  }
});

test('runList: filters by domain (case-insensitive)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runList({ domain: 'auth' })));
    const r = JSON.parse(out);
    assert.equal(r.total, 2);
    assert.ok(r.nodes.every((n: { domain: string }) => n.domain === 'AUTH'));
  } finally {
    cleanup();
  }
});

test('runList: combined type+domain filter', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runList({ type: 'requirement', domain: 'BILLING' }))
    );
    const r = JSON.parse(out);
    assert.equal(r.total, 1);
    assert.equal(r.nodes[0].id, 'REQ-BILLING-001');
  } finally {
    cleanup();
  }
});

test('runList: includes relation_count summary', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runList()));
    const r = JSON.parse(out);
    const api = r.nodes.find((n: { id: string }) => n.id === 'API-AUTH-LOGIN');
    assert.equal(api.relation_count, 1);
  } finally {
    cleanup();
  }
});

// ---------- query ----------

test('runQuery: matches by tag (highest score)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runQuery('login')));
    const r = JSON.parse(out);
    assert.ok(r.total > 0);
    // REQ-AUTH-001 has 'login' in tags AND title — should rank first.
    assert.equal(r.hits[0].id, 'REQ-AUTH-001');
  } finally {
    cleanup();
  }
});

test('runQuery: matches by title', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runQuery('invoice')));
    const r = JSON.parse(out);
    assert.equal(r.total, 1);
    assert.equal(r.hits[0].id, 'REQ-BILLING-001');
  } finally {
    cleanup();
  }
});

test('runQuery: respects --limit', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runQuery('auth', { limit: 1 }))
    );
    const r = JSON.parse(out);
    assert.equal(r.hits.length, 1);
    assert.ok(r.total >= 1, 'total reflects unfiltered count');
  } finally {
    cleanup();
  }
});

test('runQuery: empty query fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runQuery('   '));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runQuery: stop words filtered (no match on "the" / "a" / "is")', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    const { out } = withCwd(dir, () => captured(() => runQuery('the and is')));
    const r = JSON.parse(out);
    assert.equal(r.total, 0, 'all-stopwords query returns nothing');
  } finally {
    cleanup();
  }
});
