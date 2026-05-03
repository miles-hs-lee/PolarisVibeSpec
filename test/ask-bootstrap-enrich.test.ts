import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runAsk } from '../src/commands/ask';
import { runBootstrap } from '../src/commands/bootstrap';
import { runEnrich } from '../src/commands/enrich';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

// ---------- pv ask ----------

function setupAskGraph(dir: string) {
  const g = emptyGraph();
  g.nodes['REQ-AUTH-001'] = makeNode({
    id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH',
    title: 'Login with email', tags: ['auth', 'login']
  });
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
    title: 'POST /auth/login', tags: ['auth'],
    relations: [{ type: 'implements', target: 'REQ-AUTH-001' }]
  });
  writeGraph(dir, g);
  writeCodemap(dir, { 'API-AUTH-LOGIN': ['src/auth/login.ts'] });
}

test('runAsk: returns classification + hits + impact for top hit', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runAsk('Add passkey signin to the login flow'))
    );
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    assert.ok(r.classification.recommendation);
    assert.ok(r.hits.length > 0);
    assert.ok(r.impact, 'impact computed for top hit');
  } finally {
    cleanup();
  }
});

test('runAsk: rename intent → use_grep recommendation', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runAsk('Rename loginUser to authenticateUser'))
    );
    const r = JSON.parse(out);
    assert.equal(r.classification.recommendation, 'use_grep');
  } finally {
    cleanup();
  }
});

test('runAsk: --minimal output format strips to {recommendation, reason, root, coverage, files}', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runAsk('Add login feature', { minimal: true }))
    );
    const r = JSON.parse(out);
    assert.ok('recommendation' in r);
    assert.ok('files' in r);
    assert.equal(r.hits, undefined, 'hits not in minimal');
    assert.equal(r.impact, undefined, 'impact not in minimal');
  } finally {
    cleanup();
  }
});

test('runAsk: --minimal with use_grep recommendation returns empty files', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runAsk('Rename auth to identity', { minimal: true }))
    );
    const r = JSON.parse(out);
    assert.equal(r.recommendation, 'use_grep');
    assert.deepEqual(r.files, []);
  } finally {
    cleanup();
  }
});

test('runAsk: empty intent fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runAsk('   '));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runAsk: writes a usage entry to .polaris/usage.jsonl', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupAskGraph(dir);
    withCwd(dir, () => captured(() => runAsk('Add login feature')));

    const usagePath = path.join(dir, '.polaris', 'usage.jsonl');
    assert.ok(fs.existsSync(usagePath), 'usage log written');
    const lines = fs.readFileSync(usagePath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.intent, 'Add login feature');
    assert.ok(entry.recommendation);
    assert.ok(entry.ts);
  } finally {
    cleanup();
  }
});

// ---------- pv bootstrap ----------

function setupBootstrapRepo(dir: string) {
  fs.mkdirSync(path.join(dir, 'src/auth'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/billing'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src/auth/login.ts'),
    "export function login() {}\n// POST /auth/login\n"
  );
  fs.writeFileSync(
    path.join(dir, 'src/auth/user.ts'),
    "export class User { id!: string; email!: string; }\n"
  );
  fs.writeFileSync(
    path.join(dir, 'src/billing/charge.ts'),
    "export function charge() {}\n// charge handler\n"
  );
}

test('runBootstrap: scans src/ and proposes nodes by name + content signal', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupBootstrapRepo(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runBootstrap({ scanRoot: 'src' }))
    );
    const r = JSON.parse(out);
    assert.equal(r.ok, true);
    assert.ok(r.summary.nodes_proposed > 0);
    assert.ok(r.summary.domains.includes('AUTH'));
    assert.ok(r.summary.domains.includes('BILLING'));

    const draftGraph = JSON.parse(
      fs.readFileSync(path.join(dir, '.polaris', 'graph.bootstrap.json'), 'utf8')
    );
    // 'login' is in API_NAME_VERB → api type
    assert.ok(Object.values(draftGraph.nodes).some(
      (n: unknown) => (n as { type: string; domain: string }).type === 'api' && (n as { domain: string }).domain === 'AUTH'
    ));
    // 'user' matches ENTITY_NAME → entity
    assert.ok(Object.values(draftGraph.nodes).some(
      (n: unknown) => (n as { type: string }).type === 'entity'
    ));
  } finally {
    cleanup();
  }
});

test('runBootstrap: missing scan root fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runBootstrap({ scanRoot: 'nonexistent' }));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runBootstrap: --prompt mode emits agent prompt instead of summary', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setupBootstrapRepo(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runBootstrap({ scanRoot: 'src', prompt: true }))
    );
    // Output is markdown prompt, not JSON.
    assert.ok(!out.startsWith('{'));
    assert.match(out, /graph\.bootstrap\.json/);

    // Draft files still written.
    assert.ok(fs.existsSync(path.join(dir, '.polaris', 'graph.bootstrap.json')));
  } finally {
    cleanup();
  }
});

test('runBootstrap: skips test files, .d.ts, _-prefix, index files', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'src/auth'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/auth/login.ts'), "export function login() {}");
    fs.writeFileSync(path.join(dir, 'src/auth/login.test.ts'), "// test");
    fs.writeFileSync(path.join(dir, 'src/auth/types.d.ts'), "export type X = string;");
    fs.writeFileSync(path.join(dir, 'src/auth/_internal.ts'), "// private");
    fs.writeFileSync(path.join(dir, 'src/auth/index.ts'), "export * from './login';");

    const { out } = withCwd(dir, () =>
      captured(() => runBootstrap({ scanRoot: 'src' }))
    );
    const r = JSON.parse(out);
    assert.equal(r.summary.files_scanned, 1, 'only login.ts considered');
  } finally {
    cleanup();
  }
});

// ---------- pv enrich ----------

test('runEnrich: requires --prompt (fails without it)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({ id: 'REQ-X-001', type: 'requirement', domain: 'X' });
    writeGraph(dir, g);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runEnrich('REQ-X-001'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runEnrich: --prompt emits markdown prompt for the agent', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const g = emptyGraph();
    g.nodes['REQ-X-001'] = makeNode({
      id: 'REQ-X-001', type: 'requirement', domain: 'X',
      title: 'Test req'
    });
    writeGraph(dir, g);
    writeCodemap(dir, { 'REQ-X-001': ['src/x.ts'] });

    const { out } = withCwd(dir, () =>
      captured(() => runEnrich('REQ-X-001', { prompt: true }))
    );
    assert.ok(!out.startsWith('{'), 'markdown not JSON');
    assert.match(out, /REQ-X-001/);
  } finally {
    cleanup();
  }
});

test('runEnrich: missing node fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runEnrich('REQ-X-GHOST', { prompt: true }));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});
