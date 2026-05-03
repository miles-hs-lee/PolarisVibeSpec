import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { runReview, buildReviewPrompt, truncateDiff, summarizeDescription } from '../src/commands/review';
import { analyzeDiff } from '../src/commands/changed';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit, gitInitAndCommit
} from './helpers';

function commit(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, stdio: 'pipe' });
}

function setupReviewRepo(dir: string) {
  fs.mkdirSync(path.join(dir, 'src', 'auth'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// initial impl\n');

  const g = emptyGraph();
  g.nodes['REQ-AUTH-001'] = makeNode({
    id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH',
    title: 'Email + password login',
    description: 'Users sign in with email and password. Password is stored hashed.'
  });
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
    title: 'POST /auth/login',
    description: 'Accepts {email, password}; returns a session token.',
    relations: [{ type: 'implements', target: 'REQ-AUTH-001' }]
  });
  writeGraph(dir, g);
  writeCodemap(dir, { 'API-AUTH-LOGIN': ['src/auth/login.ts'] });

  fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'prd', 'CORE.md'),
    [
      '---',
      'intents: [REQ-AUTH-001, API-AUTH-LOGIN]',
      '---',
      '# Login PRD',
      '',
      '## Story: signing in',
      '',
      'Users authenticate with their email address and password to access the app.',
      '',
      '<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->'
    ].join('\n')
  );

  gitInitAndCommit(dir, 'initial');
}

// ---------- runReview command behavior ----------

test('runReview: requires --prompt, fails without it', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runReview(undefined));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runReview: emits markdown to stdout (not JSON)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// updated impl\n');
    commit(dir, 'modify login');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    assert.ok(!out.startsWith('{'), 'markdown not JSON');
    assert.match(out, /^# Intent review/m);
  } finally {
    cleanup();
  }
});

test('runReview: prompt includes the diff text for modified source files', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    fs.writeFileSync(
      path.join(dir, 'src', 'auth', 'login.ts'),
      '// COMPLETELY-NEW-IMPLEMENTATION-MARKER\n'
    );
    commit(dir, 'rewrite');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    assert.match(out, /## Diff/);
    assert.match(out, /COMPLETELY-NEW-IMPLEMENTATION-MARKER/);
  } finally {
    cleanup();
  }
});

test('runReview: prompt includes linked Intent description and PRD section body', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// new\n');
    commit(dir, 'modify');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    assert.match(out, /API-AUTH-LOGIN/);
    assert.match(out, /returns a session token/);
    assert.match(out, /Story: signing in/);
    assert.match(out, /Users authenticate with their email address/);
  } finally {
    cleanup();
  }
});

test('runReview: prompt strips pv-* directives from rendered PRD section', () => {
  // We don't want the agent following our internal directives — they're
  // structural metadata, not prose to evaluate.
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// modified\n');
    commit(dir, 'modify');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    // The rendered PRD section should NOT contain the directive comment.
    const prdContext = out.split('## Diff')[0]; // section before ## Diff
    assert.ok(
      !/<!-- pv-intents:/.test(prdContext),
      'directives should be stripped from rendered PRD section'
    );
  } finally {
    cleanup();
  }
});

test('runReview: prompt always ends with output spec (JSON shape)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// modified\n');
    commit(dir, 'modify');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    assert.match(out, /## Output format/);
    assert.match(out, /"patches":/);
    assert.match(out, /intent_description_update/);
    assert.match(out, /new_intent_node/);
    assert.match(out, /prd_section_update/);
    assert.match(out, /codemap_link/);
  } finally {
    cleanup();
  }
});

test('runReview: empty diff still emits a structured prompt (with no-changes notice)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    // No changes after the initial commit. base..HEAD has nothing.

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD', { prompt: true }))
    );
    assert.match(out, /^# Intent review/m);
    assert.match(out, /No source-file changes to show|No structural findings/);
    assert.match(out, /## Output format/);
  } finally {
    cleanup();
  }
});

test('runReview: orphan_added in findings is rendered as warn line', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupReviewRepo(dir);
    // Add a new source file without registering in codemap.
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'passkey.ts'), '// new feature\n');
    commit(dir, 'add passkey');

    const { out } = withCwd(dir, () =>
      captured(() => runReview('HEAD~1', { prompt: true }))
    );
    assert.match(out, /orphan_added/);
    assert.match(out, /passkey\.ts/);
  } finally {
    cleanup();
  }
});

// ---------- buildReviewPrompt as a pure function ----------

test('buildReviewPrompt: deterministic output sections', () => {
  // Construct a synthetic AnalyzeResult to exercise the pure path.
  const graph = emptyGraph();
  graph.nodes['API-X-FOO'] = makeNode({
    id: 'API-X-FOO', type: 'api', domain: 'X',
    title: 'Foo endpoint', description: 'Does foo.'
  });
  const result = {
    base: 'main',
    entries: [{ status: 'M' as const, path: 'src/foo.ts' }],
    graph,
    codemap: { 'API-X-FOO': ['src/foo.ts'] },
    prdIndex: new Map<string, Array<{ path: string; section: string }>>(),
    findings: [
      {
        severity: 'info' as const,
        kind: 'linked_node' as const,
        file: 'src/foo.ts',
        node: 'API-X-FOO',
        message: 'src/foo.ts is linked to API-X-FOO.'
      }
    ]
  };

  const out = buildReviewPrompt(result, '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ ...', '/tmp/fake');
  assert.match(out, /^# Intent review: main\.\.HEAD/m);
  assert.match(out, /## Structural findings/);
  assert.match(out, /## Linked Intent \+ PRD context/);
  assert.match(out, /## Diff/);
  assert.match(out, /## Output format/);
  assert.match(out, /API-X-FOO/);
  assert.match(out, /Does foo\./);
});

test('buildReviewPrompt: empty findings shows a no-findings notice', () => {
  const result = {
    base: 'main',
    entries: [],
    graph: emptyGraph(),
    codemap: {},
    prdIndex: new Map<string, Array<{ path: string; section: string }>>(),
    findings: []
  };
  const out = buildReviewPrompt(result, '', '/tmp/fake');
  assert.match(out, /No structural findings/);
  assert.match(out, /No source-file changes/);
});

// ---------- prompt-size compression (Phase A) ----------

test('truncateDiff: short blocks pass through unchanged', () => {
  const diff = 'diff --git a/foo b/foo\n@@ -1 +1 @@\n-x\n+y\n';
  const out = truncateDiff(diff);
  assert.equal(out, diff);
});

test('truncateDiff: caps a long single-file diff with truncation marker', () => {
  const lines = ['diff --git a/foo b/foo', '@@ -1 +500 @@'];
  for (let i = 0; i < 1000; i++) lines.push(`+line ${i}`);
  const diff = lines.join('\n');
  const out = truncateDiff(diff, 200);
  const outLines = out.split('\n');
  assert.ok(outLines.length <= 201, 'capped at 200 lines + 1 marker');
  assert.match(out, /more lines truncated/);
});

test('truncateDiff: caps each per-file block independently', () => {
  const block1 = ['diff --git a/foo b/foo', ...Array.from({ length: 300 }, (_, i) => `+a${i}`)];
  const block2 = ['diff --git a/bar b/bar', ...Array.from({ length: 50 }, (_, i) => `+b${i}`)];
  const diff = [...block1, ...block2].join('\n');
  const out = truncateDiff(diff, 200);
  // Block 1 truncated, block 2 intact.
  assert.ok(out.includes('more lines truncated'));
  assert.ok(out.includes('+b0'));
  assert.ok(out.includes('+b49'));
});

test('summarizeDescription: short text stays intact', () => {
  const s = 'Short single-line description.';
  assert.equal(summarizeDescription(s), s);
});

test('summarizeDescription: long text truncated at sentence boundary', () => {
  const s =
    'First sentence with content. Second sentence adds more. Third sentence. ' +
    'Fourth. Fifth. Sixth long sentence with a lot of trailing words to push past the cap. ' +
    'Seventh sentence beyond. Eighth. Ninth. Tenth. ' +
    'eleventh padding sentence to ensure we go past the 400 char threshold by some clear margin so the truncate logic is exercised in a way that the test can observe deterministically without relying on tiny inputs that might not actually trip truncation.';
  const out = summarizeDescription(s, 400);
  assert.ok(out.length < s.length);
  assert.match(out, /truncated/);
});

test('buildReviewPrompt: PRD section bodies are deduplicated to an appendix', () => {
  // Two nodes both link to the same PRD section. Body should appear ONCE.
  const graph = emptyGraph();
  graph.nodes['API-X-A'] = makeNode({ id: 'API-X-A', type: 'api', domain: 'X', title: 'A' });
  graph.nodes['API-X-B'] = makeNode({ id: 'API-X-B', type: 'api', domain: 'X', title: 'B' });
  // Both nodes are in codemap pointing at the same source file.
  const codemap = { 'API-X-A': ['src/foo.ts'], 'API-X-B': ['src/foo.ts'] };
  const prdIndex = new Map([
    ['API-X-A', [{ path: 'docs/prd/CORE.md', section: 'Story: shared' }]],
    ['API-X-B', [{ path: 'docs/prd/CORE.md', section: 'Story: shared' }]]
  ]);
  const result = {
    base: 'main',
    entries: [{ status: 'M' as const, path: 'src/foo.ts' }],
    graph,
    codemap,
    prdIndex,
    findings: []
  };

  const out = buildReviewPrompt(result, '', '/tmp/fake');
  // The §anchor should be referenced from both nodes inline.
  const anchorMatches = out.match(/§docs-prd-core-md--story-shared/g) ?? [];
  // Two inline refs (one per node) + one appendix definition = 3 total.
  assert.ok(anchorMatches.length >= 2, 'appears in both node sections');
  // Appendix label should appear once.
  const appendixHeader = out.match(/PRD section bodies/g) ?? [];
  assert.equal(appendixHeader.length, 1);
});
