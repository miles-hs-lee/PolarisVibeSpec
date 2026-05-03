import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  runChanged,
  parseGitDiff,
  buildFileToNodes,
  buildNodeToPrdSections,
  generateFindings,
  Finding
} from '../src/commands/changed';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit, gitInitAndCommit
} from './helpers';

// ---------- pure helpers ----------

test('parseGitDiff: handles A/M/D/R status lines', () => {
  const raw = [
    'A\tsrc/foo.ts',
    'M\tsrc/bar.ts',
    'D\tsrc/old.ts',
    'R100\tsrc/oldname.ts\tsrc/newname.ts'
  ].join('\n');
  const entries = parseGitDiff(raw);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], { status: 'A', path: 'src/foo.ts' });
  assert.deepEqual(entries[1], { status: 'M', path: 'src/bar.ts' });
  assert.deepEqual(entries[2], { status: 'D', path: 'src/old.ts' });
  assert.deepEqual(entries[3], {
    status: 'R',
    old_path: 'src/oldname.ts',
    path: 'src/newname.ts'
  });
});

test('parseGitDiff: ignores empty lines and other status codes', () => {
  const raw = '\nA\tsrc/foo.ts\nT\tsrc/typecode.ts\n\n';
  const entries = parseGitDiff(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, 'src/foo.ts');
});

test('buildFileToNodes: reverses codemap', () => {
  const idx = buildFileToNodes({
    'API-X-A': ['src/a.ts', 'src/shared.ts'],
    'API-X-B': ['src/b.ts', 'src/shared.ts']
  });
  assert.deepEqual(idx.get('src/a.ts'), ['API-X-A']);
  assert.deepEqual(idx.get('src/b.ts'), ['API-X-B']);
  assert.deepEqual(idx.get('src/shared.ts')?.sort(), ['API-X-A', 'API-X-B']);
});

// ---------- generateFindings (unit, no IO) ----------

function setupGraph() {
  const g = emptyGraph();
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH', title: 'POST /auth/login'
  });
  g.nodes['REQ-AUTH-001'] = makeNode({
    id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH', title: 'Email login'
  });
  return g;
}

test('generateFindings: orphan_added on new source file with no codemap link', () => {
  const findings = generateFindings(
    [{ status: 'A', path: 'src/auth/passkey.ts' }],
    setupGraph(),
    {},
    new Map()
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'orphan_added');
  assert.equal(findings[0].severity, 'warn');
  assert.match(findings[0].suggested_action!, /pv add-file/);
});

test('generateFindings: added file inside ignored path is silent', () => {
  const findings = generateFindings(
    [{ status: 'A', path: '.polaris/graph.json' }],
    setupGraph(),
    {},
    new Map()
  );
  assert.equal(findings.length, 0, 'graph.json is PV-managed, not flagged');
});

test('generateFindings: test files are ignored (not subject to orphan_added)', () => {
  // Tests aren't product behavior — they're infrastructure that
  // exercises product behavior. We don't expect them in codemap.
  const findings = generateFindings(
    [
      { status: 'A', path: 'test/foo.test.ts' },
      { status: 'A', path: '__tests__/bar.spec.ts' },
      { status: 'A', path: 'experiments/bench/setup.sh' },
      { status: 'A', path: 'scripts/regen.py' }
    ],
    setupGraph(),
    {},
    new Map()
  );
  assert.equal(findings.length, 0, 'all infra paths skip orphan check');
});

test('generateFindings: added non-source file (e.g. .md) does not trigger orphan_added', () => {
  const findings = generateFindings(
    [{ status: 'A', path: 'README.md' }],
    setupGraph(),
    {},
    new Map()
  );
  // No findings — not source, not ignored either, just not flagged.
  assert.equal(findings.length, 0);
});

test('generateFindings: modified linked file emits info with PRD references', () => {
  const prdIndex = new Map([
    ['API-AUTH-LOGIN', [
      { path: 'docs/prd/CORE.md', section: 'Story: signing in' },
      { path: 'docs/prd/CORE.md', section: 'Success metrics' }
    ]]
  ]);
  const findings = generateFindings(
    [{ status: 'M', path: 'src/auth/login.ts' }],
    setupGraph(),
    { 'API-AUTH-LOGIN': ['src/auth/login.ts'] },
    prdIndex
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'linked_node');
  assert.equal(findings[0].severity, 'info');
  assert.equal(findings[0].node, 'API-AUTH-LOGIN');
  assert.equal(findings[0].linked_prds?.length, 2);
});

test('generateFindings: modified orphan file is silent (already orphan, not new drift)', () => {
  const findings = generateFindings(
    [{ status: 'M', path: 'src/auth/orphan.ts' }],
    setupGraph(),
    {},
    new Map()
  );
  assert.equal(findings.length, 0);
});

test('generateFindings: removed file still in codemap is broken_codemap (error)', () => {
  const findings = generateFindings(
    [{ status: 'D', path: 'src/auth/login.ts' }],
    setupGraph(),
    { 'API-AUTH-LOGIN': ['src/auth/login.ts'] },
    new Map()
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'broken_codemap');
  assert.equal(findings[0].severity, 'error');
  assert.match(findings[0].suggested_action!, /pv rm-file/);
});

test('generateFindings: removed file not in codemap is silent', () => {
  const findings = generateFindings(
    [{ status: 'D', path: 'src/auth/old.ts' }],
    setupGraph(),
    {},
    new Map()
  );
  assert.equal(findings.length, 0);
});

test('generateFindings: rename with codemap NOT updated → rename_codemap (error)', () => {
  const findings = generateFindings(
    [{ status: 'R', old_path: 'src/auth/login.ts', path: 'src/auth/signin.ts' }],
    setupGraph(),
    { 'API-AUTH-LOGIN': ['src/auth/login.ts'] },
    new Map()
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'rename_codemap');
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].file_old, 'src/auth/login.ts');
  assert.equal(findings[0].file_new, 'src/auth/signin.ts');
});

test('generateFindings: rename WITH codemap updated → linked_node (info)', () => {
  const findings = generateFindings(
    [{ status: 'R', old_path: 'src/auth/login.ts', path: 'src/auth/signin.ts' }],
    setupGraph(),
    { 'API-AUTH-LOGIN': ['src/auth/signin.ts'] }, // already pointing at new path
    new Map()
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'linked_node');
  assert.equal(findings[0].severity, 'info');
});

test('generateFindings: rename to new orphan source emits orphan_added', () => {
  const findings = generateFindings(
    [{ status: 'R', old_path: 'src/foo.ts', path: 'src/bar.ts' }],
    setupGraph(),
    {}, // no codemap on either path
    new Map()
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'orphan_added');
  assert.match(findings[0].message, /renamed from/);
});

test('generateFindings: empty diff produces empty findings', () => {
  const findings = generateFindings([], setupGraph(), {}, new Map());
  assert.equal(findings.length, 0);
});

// ---------- buildNodeToPrdSections (IO) ----------

test('buildNodeToPrdSections: indexes section-level intents from real PRDs', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs', 'prd', 'a.md'),
      [
        '---',
        'intents: [REQ-X-001]',
        '---',
        '# PRD',
        '## Section A',
        '<!-- pv-intents: REQ-X-001, API-X-FOO -->',
        '## Section B',
        '<!-- pv-intents: API-X-FOO -->'
      ].join('\n')
    );

    const idx = buildNodeToPrdSections([path.join(dir, 'docs', 'prd', 'a.md')], dir);
    assert.equal(idx.get('REQ-X-001')?.length, 1);
    assert.equal(idx.get('API-X-FOO')?.length, 2);
  } finally {
    cleanup();
  }
});

// ---------- end-to-end runChanged with real git ----------

function setupGitRepo(dir: string) {
  // Create initial commit so we have a base ref to diff against.
  fs.mkdirSync(path.join(dir, 'src', 'auth'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// initial\n');
  const g = emptyGraph();
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH', title: 'POST /auth/login'
  });
  writeGraph(dir, g);
  writeCodemap(dir, { 'API-AUTH-LOGIN': ['src/auth/login.ts'] });
  gitInitAndCommit(dir, 'initial');
}

function commit(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, stdio: 'pipe' });
}

test('runChanged (e2e): clean diff → ok=true, no findings, no exit', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupGitRepo(dir);
    // Modify a linked file but don't add anything new.
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// modified\n');
    commit(dir, 'modify login');

    const { out } = withCwd(dir, () =>
      captured(() => runChanged('HEAD~1', { pretty: false }))
    );
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    // findings include linked_node info, but no warn/error.
    assert.ok(r.findings.every((f: Finding) => f.severity === 'info'));
  } finally {
    cleanup();
  }
});

test('runChanged (e2e): orphan_added → ok=false, exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupGitRepo(dir);
    // Add a new source file without registering it in codemap.
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'passkey.ts'), '// new\n');
    commit(dir, 'add passkey');

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runChanged('HEAD~1'));
      exitCode = r.code;
    }));
    const r = JSON.parse(out);
    assert.equal(exitCode, 1);
    assert.equal(r.ok, false);
    assert.ok(r.findings.some((f: Finding) => f.kind === 'orphan_added'));
  } finally {
    cleanup();
  }
});

test('runChanged (e2e): broken_codemap → exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupGitRepo(dir);
    // Remove the linked file but don't update codemap.
    fs.unlinkSync(path.join(dir, 'src', 'auth', 'login.ts'));
    commit(dir, 'remove login');

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runChanged('HEAD~1'));
      exitCode = r.code;
    }));
    const r = JSON.parse(out);
    assert.equal(exitCode, 1);
    assert.ok(r.findings.some((f: Finding) => f.kind === 'broken_codemap'));
  } finally {
    cleanup();
  }
});

test('runChanged (e2e): summary reports non-zero counts when findings present', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'passkey.ts'), '// new\n');
    fs.writeFileSync(path.join(dir, 'src', 'auth', 'login.ts'), '// modified\n');
    commit(dir, 'add + modify');

    let exitCode: number | undefined;
    const { out } = withCwd(dir, () => captured(() => {
      const r = expectExit(() => runChanged('HEAD~1'));
      exitCode = r.code;
    }));
    const r = JSON.parse(out);
    assert.equal(r.summary.files_in_diff, 2);
    assert.equal(r.summary.orphan_added, 1);
    assert.equal(r.summary.linked_nodes_touched, 1);
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runChanged (e2e): missing base ref fails fast with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupGitRepo(dir);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runChanged('refs/heads/does-not-exist'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});
