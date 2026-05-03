import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runDiagram } from '../src/commands/diagram';
import { runExport } from '../src/commands/export';
import {
  tmpRepo, writeGraph, makeNode, emptyGraph,
  withCwd, captured, expectExit
} from './helpers';

function buildGraph(dir: string) {
  const g = emptyGraph();
  g.nodes['REQ-AUTH-001'] = makeNode({
    id: 'REQ-AUTH-001', type: 'requirement', domain: 'AUTH',
    title: 'Login req', description: 'Email + password.'
  });
  g.nodes['API-AUTH-LOGIN'] = makeNode({
    id: 'API-AUTH-LOGIN', type: 'api', domain: 'AUTH',
    title: 'POST /auth/login',
    relations: [{ type: 'implements', target: 'REQ-AUTH-001' }]
  });
  g.nodes['REQ-BILLING-001'] = makeNode({
    id: 'REQ-BILLING-001', type: 'requirement', domain: 'BILLING',
    title: 'Invoice'
  });
  writeGraph(dir, g);
}

// ---------- diagram ----------

test('runDiagram: emits Mermaid by default', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () => captured(() => runDiagram()));
    assert.match(out, /graph TD/, 'Mermaid format');
    assert.match(out, /REQ-AUTH-001/);
    assert.match(out, /API-AUTH-LOGIN/);
  } finally {
    cleanup();
  }
});

test('runDiagram: emits Graphviz when --format graphviz', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runDiagram({ format: 'graphviz' }))
    );
    assert.match(out, /digraph/, 'Graphviz format');
    assert.match(out, /REQ-AUTH-001/);
  } finally {
    cleanup();
  }
});

test('runDiagram: --domain narrows to one domain', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runDiagram({ domain: 'AUTH' }))
    );
    assert.match(out, /REQ-AUTH-001/);
    assert.ok(!out.includes('REQ-BILLING-001'), 'BILLING node excluded');
  } finally {
    cleanup();
  }
});

test('runDiagram: --node centers subgraph on a node', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runDiagram({ node: 'REQ-AUTH-001', depth: 1 }))
    );
    assert.match(out, /REQ-AUTH-001/);
    assert.match(out, /API-AUTH-LOGIN/);
    assert.ok(!out.includes('REQ-BILLING-001'));
  } finally {
    cleanup();
  }
});

test('runDiagram: missing --node fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runDiagram({ node: 'REQ-X-GHOST' }));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runDiagram: unknown format fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      // @ts-expect-error — testing invalid format
      const r = expectExit(() => runDiagram({ format: 'svg' }));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runDiagram: --out writes to file and prints relative path', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runDiagram({ out: 'docs/arch.mmd' }))
    );
    assert.match(out.trim(), /docs\/arch\.mmd/);

    const written = fs.readFileSync(path.join(dir, 'docs/arch.mmd'), 'utf8');
    assert.match(written, /graph TD/);
  } finally {
    cleanup();
  }
});

// ---------- export ----------

test('runExport: emits Markdown for one node to stdout', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runExport('REQ-AUTH-001'))
    );
    assert.match(out, /^# REQ-AUTH-001/m);
    assert.match(out, /Email \+ password/);
    assert.ok(!out.startsWith('{'), 'markdown not JSON');
  } finally {
    cleanup();
  }
});

test('runExport: --write persists to .polaris/specs/<id>.md', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runExport('REQ-AUTH-001', { write: true }))
    );
    const r = JSON.parse(out);
    assert.match(r.written, /REQ-AUTH-001\.md/);
    assert.ok(r.bytes > 0);

    const written = fs.readFileSync(
      path.join(dir, '.polaris', 'specs', 'REQ-AUTH-001.md'),
      'utf8'
    );
    assert.match(written, /^# REQ-AUTH-001/m);
  } finally {
    cleanup();
  }
});

test('runExport: missing node fails with exit 1', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runExport('REQ-X-GHOST'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);
  } finally {
    cleanup();
  }
});

test('runExport: includes incoming relations for the target node', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    buildGraph(dir);
    const { out } = withCwd(dir, () =>
      captured(() => runExport('REQ-AUTH-001'))
    );
    assert.match(out, /Incoming relations/);
    assert.match(out, /API-AUTH-LOGIN/);
  } finally {
    cleanup();
  }
});
