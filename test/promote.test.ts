import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPromote } from '../src/commands/promote';
import { runExportAll } from '../src/commands/exportAll';
import {
  tmpRepo, writeGraph, readGraph, makeNode, emptyGraph,
  muted, withCwd, captured, expectExit
} from './helpers';

test('promote applies title edit', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001',
      type: 'requirement',
      domain: 'X',
      title: 'Old title',
      description: 'desc'
    });
    writeGraph(dir, graph);

    withCwd(dir, () => muted(() => runExportAll()));

    // Edit the H1 title.
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    const md = fs.readFileSync(specPath, 'utf8').replace(
      '# REQ-X-001 — Old title',
      '# REQ-X-001 — New title'
    );
    fs.writeFileSync(specPath, md, 'utf8');

    withCwd(dir, () => muted(() => runPromote()));

    const after = readGraph(dir);
    assert.equal(after.nodes['REQ-X-001'].title, 'New title');
  } finally {
    cleanup();
  }
});

test('promote can clear description (empty section is treated as deliberate clear)', () => {
  // P3 regression: empty `## Description` section must propagate to the
  // graph as description=''. Previously the truthy check refused to apply.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001',
      type: 'requirement',
      domain: 'X',
      description: 'Existing prose to be cleared.'
    });
    writeGraph(dir, graph);

    withCwd(dir, () => muted(() => runExportAll()));

    // Replace description content with nothing — section header stays,
    // body is empty.
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    const md = fs.readFileSync(specPath, 'utf8');
    const cleared = md.replace(
      /## Description\n\n[\s\S]*?\n\n(?=---|\n_Generated)/,
      '## Description\n\n'
    );
    assert.notEqual(cleared, md, 'sanity: regex actually replaced something');
    fs.writeFileSync(specPath, cleared, 'utf8');

    withCwd(dir, () => muted(() => runPromote()));

    const after = readGraph(dir);
    assert.equal(after.nodes['REQ-X-001'].description, '');
  } finally {
    cleanup();
  }
});

test('promote leaves description alone when section is missing entirely', () => {
  // The other half of P3: if the `## Description` section is removed
  // (not present in the markdown at all), promote must NOT clear the
  // graph's description — null means "no opinion."
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001',
      type: 'requirement',
      domain: 'X',
      description: 'Should survive.'
    });
    writeGraph(dir, graph);

    withCwd(dir, () => muted(() => runExportAll()));

    // Strip the entire Description section from the file.
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    const md = fs.readFileSync(specPath, 'utf8');
    const stripped = md.replace(/## Description\n\n[\s\S]*?\n\n(?=---|\n_Generated)/, '');
    fs.writeFileSync(specPath, stripped, 'utf8');

    withCwd(dir, () => muted(() => runPromote()));

    const after = readGraph(dir);
    assert.equal(after.nodes['REQ-X-001'].description, 'Should survive.');
  } finally {
    cleanup();
  }
});

// ---------- structural rejections ----------

function setupExportedNode(dir: string) {
  const g = emptyGraph();
  g.nodes['REQ-X-001'] = makeNode({
    id: 'REQ-X-001', type: 'requirement', domain: 'X',
    title: 'Original', description: 'desc', tags: ['t1'],
    relations: [{ type: 'affects', target: 'REQ-X-002' }]
  });
  g.nodes['REQ-X-002'] = makeNode({ id: 'REQ-X-002', type: 'requirement', domain: 'X' });
  writeGraph(dir, g);
  withCwd(dir, () => muted(() => runExportAll()));
}

function rejectionTest(label: string, edit: (md: string) => string, reasonRe: RegExp) {
  test(`promote: reject ${label}`, () => {
    const { dir, cleanup } = tmpRepo();
    try {
      setupExportedNode(dir);
      const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
      fs.writeFileSync(specPath, edit(fs.readFileSync(specPath, 'utf8')), 'utf8');

      // captured-outside, expectExit-inside: stdout is recorded BEFORE the
      // synthetic ProcessExit throw bubbles out of expectExit.
      let exitCode: number | undefined;
      const { out } = withCwd(dir, () => captured(() => {
        const r = expectExit(() => runPromote());
        exitCode = r.code;
      }));
      const parsed = JSON.parse(out) as {
        ok: boolean;
        rejected: Array<{ id: string; reasons: string[] }>;
      };

      assert.equal(exitCode, 1, 'rejection exits 1');
      assert.equal(parsed.ok, false);
      const reasons = parsed.rejected.flatMap((r) => r.reasons).join(' | ');
      assert.match(reasons, reasonRe);

      const after = readGraph(dir);
      assert.equal(after.nodes['REQ-X-001'].title, 'Original', 'graph untouched on rejection');
    } finally {
      cleanup();
    }
  });
}

rejectionTest(
  'id change',
  (md) => md.replace('# REQ-X-001 — Original', '# REQ-X-999 — Original'),
  /id changes? break references/
);
rejectionTest(
  'type change',
  (md) => md.replace('**Type:** requirement', '**Type:** api'),
  /Type changed/
);
rejectionTest(
  'domain change',
  (md) => md.replace('**Domain:** X', '**Domain:** Y'),
  /Domain changed/
);
rejectionTest(
  'createdAt change (immutable field)',
  (md) => md.replace('2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'),
  /createdAt changed/
);
rejectionTest(
  'outgoing relation added',
  (md) => md.replace(
    '## Outgoing relations\n',
    '## Outgoing relations\n\n- **uses** → [REQ-X-002](REQ-X-002.md) — REQ-X-002\n'
  ),
  /Outgoing relations changed/
);

test('promote: orphan markdown (id has no graph node) is rejected', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupExportedNode(dir);
    fs.writeFileSync(
      path.join(dir, 'spec', 'REQ-GHOST-001.md'),
      '# REQ-GHOST-001 — Stray\n\n- **Type:** requirement\n- **Domain:** GHOST\n'
    );

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPromote());
      exitCode = r.code;
    }));
    const parsed = JSON.parse(out) as { rejected: Array<{ id: string; reasons: string[] }> };

    assert.equal(exitCode, 1);
    const ghost = parsed.rejected.find((r) => r.id === 'REQ-GHOST-001');
    assert.ok(ghost, 'orphan id reported');
    assert.match(ghost!.reasons.join(' '), /no graph node/);
  } finally {
    cleanup();
  }
});

test('promote: malformed H1 surfaces as parse error', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupExportedNode(dir);
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    const md = fs.readFileSync(specPath, 'utf8').replace(
      /^# REQ-X-001 — Original$/m,
      '# Just a title without id'
    );
    fs.writeFileSync(specPath, md, 'utf8');

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPromote());
      exitCode = r.code;
    }));
    const parsed = JSON.parse(out) as { rejected: Array<{ id: string; reasons: string[] }> };

    assert.equal(exitCode, 1);
    const reasons = parsed.rejected.flatMap((r) => r.reasons).join(' ');
    assert.match(reasons, /H1/, 'parse error mentions H1');
  } finally {
    cleanup();
  }
});

test('promote: README.md and non-md files are skipped', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupExportedNode(dir);
    // Add a non-md file that would otherwise look like a node id.
    fs.writeFileSync(path.join(dir, 'spec', 'README.txt'), 'hi');

    const { out } = withCwd(dir, () => captured(() => runPromote()));
    // README.md exists (auto-generated by export-all) and is skipped, so no
    // entry for it should appear in any list.
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    const allIds = [...r.promoted, ...r.rejected, ...r.unchanged]
      .map((x: string | { id: string }) => typeof x === 'string' ? x : x.id);
    assert.ok(!allIds.includes('README'), 'README.md not processed');
    assert.ok(!allIds.includes('README.txt'), 'non-md skipped');
  } finally {
    cleanup();
  }
});

test('promote: tags can be cleared (Tags: empty list)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupExportedNode(dir);
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    // Replace the Tags line with an empty list.
    const md = fs.readFileSync(specPath, 'utf8').replace(
      /^- \*\*Tags:\*\*.*$/m,
      '- **Tags:** ' // empty after the colon
    );
    fs.writeFileSync(specPath, md, 'utf8');

    withCwd(dir, () => muted(() => runPromote()));

    const after = readGraph(dir);
    assert.deepEqual(after.nodes['REQ-X-001'].tags, []);
  } finally {
    cleanup();
  }
});

test('promote: --dry-run reports promoted count without writing graph', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupExportedNode(dir);
    const specPath = path.join(dir, 'spec', 'REQ-X-001.md');
    const md = fs.readFileSync(specPath, 'utf8').replace(
      '# REQ-X-001 — Original',
      '# REQ-X-001 — Renamed via dry-run'
    );
    fs.writeFileSync(specPath, md, 'utf8');

    const { out } = withCwd(dir, () => captured(() => runPromote({ dryRun: true })));
    const r = JSON.parse(out);
    assert.equal(r.summary.promoted, 1);
    assert.equal(r.summary.dry_run, true);

    const after = readGraph(dir);
    assert.equal(after.nodes['REQ-X-001'].title, 'Original', 'graph untouched in dry-run');
  } finally {
    cleanup();
  }
});

test('promote: spec/ not found fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    // Don't run export-all — spec/ doesn't exist.

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runPromote());
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('promote: empty spec/ (only README) reports all-unchanged', () => {
  // Edge case: graph is empty so spec/ contains only README.md after
  // export-all. promote should run cleanly and report ok=true.
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    withCwd(dir, () => muted(() => runExportAll()));

    const { out } = withCwd(dir, () => captured(() => runPromote()));
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    assert.deepEqual(r.promoted, []);
    assert.deepEqual(r.rejected, []);
  } finally {
    cleanup();
  }
});
