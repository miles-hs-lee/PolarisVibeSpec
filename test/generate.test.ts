import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runGenerate } from '../src/commands/generate';
import {
  tmpRepo, writeGraph, readGraph, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

test('runGenerate: creates a requirement node from a natural-language intent', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('Users can sign in with email and password'))
    );
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    assert.equal(r.created.length, 1);
    assert.equal(r.created[0].type, 'requirement');
    assert.equal(r.created[0].domain, 'AUTH');

    // Persisted to disk.
    const graph = readGraph(dir);
    assert.ok(graph.nodes[r.created[0].id]);
  } finally {
    cleanup();
  }
});

test('runGenerate: HTTP-verb prefix → api type', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('POST /auth/login validates credentials'))
    );
    const r = JSON.parse(out);
    assert.equal(r.created[0].type, 'api');
  } finally {
    cleanup();
  }
});

test('runGenerate: workflow keywords → workflow type', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('Login flow: validate credentials then issue token'))
    );
    const r = JSON.parse(out);
    assert.equal(r.created[0].type, 'workflow');
  } finally {
    cleanup();
  }
});

test('runGenerate: auto-links to existing same-domain peers via affects', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-001'] = makeNode({
      id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH',
      title: 'Existing auth req'
    });
    writeGraph(dir, g);

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('Add passkey signin support'))
    );
    const r = JSON.parse(out);
    assert.ok(
      r.created[0].relations.some(
        (rel: { type: string; target: string }) =>
          rel.type === 'affects' && rel.target === 'REQ-AUTH-001'
      ),
      'should auto-affect existing AUTH peer'
    );
  } finally {
    cleanup();
  }
});

test('runGenerate: empty intent fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runGenerate('   '));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runGenerate: --prompt mode emits markdown prompt without mutating graph', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('Add passkey signin', { prompt: true }))
    );

    // Output is markdown, not JSON.
    assert.ok(!out.startsWith('{'), 'should not be JSON');
    assert.match(out, /Add passkey signin/, 'intent appears in prompt');

    // Graph untouched.
    const graph = readGraph(dir);
    assert.equal(Object.keys(graph.nodes).length, 0, 'no nodes added in prompt mode');
  } finally {
    cleanup();
  }
});

test('runGenerate: --llm flag falls back to heuristic with a note', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('Users can sign in', { llm: true }))
    );
    const r = JSON.parse(out);
    assert.ok(r.notes.some((n: string) => /LLM mode/.test(n)));
    assert.equal(r.created.length, 1, 'still produces a node via heuristic');
  } finally {
    cleanup();
  }
});

test('runGenerate: explicit `implements REQ-X` reference creates implements edge', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-AUTH-001'] = makeNode({
      id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH'
    });
    writeGraph(dir, g);

    const { out } = withCwd(dir, () =>
      captured(() => runGenerate('POST /auth/login implements REQ-AUTH-001'))
    );
    const r = JSON.parse(out);
    assert.ok(
      r.created[0].relations.some(
        (rel: { type: string; target: string }) =>
          rel.type === 'implements' && rel.target === 'REQ-AUTH-001'
      )
    );
  } finally {
    cleanup();
  }
});
