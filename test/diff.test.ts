import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { runDiff } from '../src/commands/diff';
import {
  tmpRepo, writeGraph, makeNode, emptyGraph,
  gitInitAndCommit, withCwd, captured, expectExit
} from './helpers';

function commitGraphAt(dir: string): void {
  // .polaris/graph.json must exist before commit; helpers.tmpRepo
  // already mkdir'd .polaris.
  gitInitAndCommit(dir);
}

function modifyGraph(dir: string, fn: (g: ReturnType<typeof emptyGraph>) => void): void {
  const g = JSON.parse(fs.readFileSync(path.join(dir, '.polaris', 'graph.json'), 'utf8'));
  fn(g);
  writeGraph(dir, g);
}

test('runDiff: detects added nodes', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    commitGraphAt(dir);
    modifyGraph(dir, (g) => {
      g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    });

    const { out } = withCwd(dir, () => captured(() => {
      try { runDiff('HEAD'); } catch { /* exit on breaking; not breaking here */ }
    }));
    const r = JSON.parse(out);
    assert.equal(r.summary.nodes_added, 1);
    assert.deepEqual(r.added_nodes, ['REQ-X-001']);
    assert.equal(r.summary.has_breaking, false);
  } finally {
    cleanup();
  }
});

test('runDiff: detects removed nodes (breaking change)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);
    commitGraphAt(dir);
    modifyGraph(dir, (g) => { delete g.nodes['REQ-X-001']; });

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runDiff('HEAD'));
      exitCode = r.code;
    }));
    const r = JSON.parse(out);
    assert.equal(r.summary.nodes_removed, 1);
    assert.equal(r.summary.has_breaking, true);
    assert.equal(exitCode, 2, 'breaking change should exit 2');
  } finally {
    cleanup();
  }
});

test('runDiff: detects changed fields', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001', type: 'requirement', domain: 'X',
      title: 'Old', description: 'old desc', tags: ['old']
    });
    writeGraph(dir, g);
    commitGraphAt(dir);
    modifyGraph(dir, (g) => {
      g.nodes['REQ-X-001'].title = 'New';
      g.nodes['REQ-X-001'].description = 'new desc';
      g.nodes['REQ-X-001'].tags = ['new'];
    });

    const { out } = withCwd(dir, () => captured(() => {
      try { runDiff('HEAD'); } catch {}
    }));
    const r = JSON.parse(out);
    assert.equal(r.changed_nodes.length, 1);
    const fields = r.changed_nodes[0].fields.sort();
    assert.deepEqual(fields, ['description', 'tags', 'title']);
  } finally {
    cleanup();
  }
});

test('runDiff: detects added relations', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
    writeGraph(dir, g);
    commitGraphAt(dir);
    modifyGraph(dir, (g) => {
      g.nodes['API-X-FOO'].relations = [{ type: 'implements', target: 'REQ-X-001' }];
    });

    const { out } = withCwd(dir, () => captured(() => {
      try { runDiff('HEAD'); } catch {}
    }));
    const r = JSON.parse(out);
    assert.equal(r.summary.relations_added, 1);
    assert.equal(r.added_relations[0].type, 'implements');
  } finally {
    cleanup();
  }
});

test('runDiff: removed implements/uses is flagged breaking', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'implements', target: 'REQ-X-001' }]
    });
    writeGraph(dir, g);
    commitGraphAt(dir);
    modifyGraph(dir, (g) => { g.nodes['API-X-FOO'].relations = []; });

    const { code } = withCwd(dir, () =>
      expectExit(() => captured(() => runDiff('HEAD')))
    );
    assert.equal(code, 2, 'removed implements is breaking');
  } finally {
    cleanup();
  }
});

test('runDiff: removed affects is NOT breaking', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    g.nodes['API-X-FOO'] = makeNode({
      id: 'API-X-FOO', type: 'api', domain: 'X',
      relations: [{ type: 'affects', target: 'REQ-X-001' }]
    });
    writeGraph(dir, g);
    commitGraphAt(dir);
    modifyGraph(dir, (g) => { g.nodes['API-X-FOO'].relations = []; });

    const { out } = withCwd(dir, () => captured(() => {
      try { runDiff('HEAD'); } catch {}
    }));
    const r = JSON.parse(out);
    assert.equal(r.summary.relations_removed, 1);
    assert.equal(r.summary.has_breaking, false);
  } finally {
    cleanup();
  }
});

test('runDiff: nonexistent ref fails gracefully (not crash)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    commitGraphAt(dir);

    const { code } = withCwd(dir, () =>
      expectExit(() => muteStderr(() => runDiff('refs/heads/does-not-exist')))
    );
    assert.equal(code, 1);
  } finally {
    cleanup();
  }
});

test('runDiff: malicious ref does NOT execute shell — security regression for execFileSync fix', () => {
  // P1 from Codex review round 1. With the old execSync(`git show ${ref}`)
  // implementation, a ref like `HEAD; touch /tmp/PWNED` would execute the
  // appended `touch`. With execFileSync(['git', 'show', ref]), the ref is
  // a single argv slot and never reaches a shell.
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    commitGraphAt(dir);

    const sentinel = path.join(dir, 'PWNED');
    const malicious = `HEAD; touch ${sentinel}`;
    withCwd(dir, () => expectExit(() => muteStderr(() => runDiff(malicious))));

    assert.equal(
      fs.existsSync(sentinel), false,
      'shell injection sentinel must NOT exist — execFileSync should have prevented it'
    );
  } finally {
    cleanup();
  }
});

test('runDiff: malicious ref with backticks, $(), and pipes also blocked', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    commitGraphAt(dir);

    const sentinel1 = path.join(dir, 'BACKTICK');
    const sentinel2 = path.join(dir, 'SUBSHELL');
    const sentinel3 = path.join(dir, 'PIPED');

    for (const m of [
      `HEAD\`touch ${sentinel1}\``,
      `HEAD$(touch ${sentinel2})`,
      `HEAD | touch ${sentinel3}`
    ]) {
      withCwd(dir, () => expectExit(() => muteStderr(() => runDiff(m))));
    }

    assert.equal(fs.existsSync(sentinel1), false, 'backtick injection blocked');
    assert.equal(fs.existsSync(sentinel2), false, '$() injection blocked');
    assert.equal(fs.existsSync(sentinel3), false, 'pipe injection blocked');
  } finally {
    cleanup();
  }
});

// Local helper — silences stderr for the rare case fail() is hit
// inline (e.g. nonexistent ref). Distinct from muted (stdout).
function muteStderr<T>(fn: () => T): T {
  const orig = process.stderr.write.bind(process.stderr);
  // @ts-expect-error
  process.stderr.write = () => true;
  try { return fn(); } finally { process.stderr.write = orig; }
}
