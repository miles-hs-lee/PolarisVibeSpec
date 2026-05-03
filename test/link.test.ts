import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runLink } from '../src/commands/link';
import {
  tmpRepo, writeGraph, readGraph, makeNode, emptyGraph,
  withCwd, captured, expectExit, muted
} from './helpers';

function setup(dir: string) {
  const g = emptyGraph();
  g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
  g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
  writeGraph(dir, g);
}

test('runLink: adds a valid relation and persists it', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    withCwd(dir, () => muted(() => runLink('API-X-FOO', 'REQ-X-001', 'implements')));

    const after = readGraph(dir);
    assert.equal(after.nodes['API-X-FOO'].relations.length, 1);
    assert.deepEqual(after.nodes['API-X-FOO'].relations[0], {
      type: 'implements',
      target: 'REQ-X-001'
    });
  } finally {
    cleanup();
  }
});

test('runLink: rejects unknown relation type', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runLink('API-X-FOO', 'REQ-X-001', 'requires'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);

    const after = readGraph(dir);
    assert.equal(after.nodes['API-X-FOO'].relations.length, 0, 'graph unchanged on bad relation');
  } finally {
    cleanup();
  }
});

test('runLink: rejects edge from nonexistent source', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runLink('API-X-GHOST', 'REQ-X-001', 'implements'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runLink: rejects edge to nonexistent target', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runLink('API-X-FOO', 'REQ-X-GHOST', 'implements'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runLink: idempotent (adding same edge twice does not duplicate)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    withCwd(dir, () => muted(() => runLink('API-X-FOO', 'REQ-X-001', 'implements')));
    withCwd(dir, () => muted(() => runLink('API-X-FOO', 'REQ-X-001', 'implements')));

    const after = readGraph(dir);
    assert.equal(after.nodes['API-X-FOO'].relations.length, 1, 'duplicate edge silently dropped');
  } finally {
    cleanup();
  }
});

test('runLink: supports all four relation types', () => {
  for (const rel of ['depends_on', 'implements', 'affects', 'uses']) {
    const { dir, cleanup } = tmpRepo();
    try {
      setup(dir);
      withCwd(dir, () => muted(() => runLink('API-X-FOO', 'REQ-X-001', rel)));
      const after = readGraph(dir);
      assert.equal(after.nodes['API-X-FOO'].relations[0].type, rel);
    } finally {
      cleanup();
    }
  }
});
