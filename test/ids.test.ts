import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { mintId } from '../src/ids';
import { tmpRepo, writeGraph, makeNode, emptyGraph } from './helpers';

test('mintId starts at 001 on empty graph', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    writeGraph(dir, emptyGraph());
    const id = mintId({ type: 'requirement', domain: 'AUTH', title: 'first' }, dir);
    assert.equal(id, 'REQ-AUTH-001');
  } finally {
    cleanup();
  }
});

test('mintId seeds counter from existing graph when counters.json is missing', () => {
  // Regression for the "adopted graph" P2#3 bug: counters.json absent but
  // graph already has REQ-GENERAL-001 → next mint must skip past it.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-GENERAL-001'] = makeNode({
      id: 'REQ-GENERAL-001',
      type: 'requirement',
      domain: 'GENERAL'
    });
    writeGraph(dir, graph);
    // No counters.json on disk.
    assert.equal(fs.existsSync(path.join(dir, '.polaris', 'counters.json')), false);

    const id = mintId({ type: 'requirement', domain: 'GENERAL', title: 'second' }, dir);
    assert.equal(id, 'REQ-GENERAL-002');
  } finally {
    cleanup();
  }
});

test('mintId seeds from highest existing requirement number, not just count', () => {
  // If graph has REQ-AUTH-007, next mint must be 008 even though there's
  // only one node — we sync by the *number*, not by node count.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['REQ-AUTH-007'] = makeNode({
      id: 'REQ-AUTH-007',
      type: 'requirement',
      domain: 'AUTH'
    });
    writeGraph(dir, graph);

    const id = mintId({ type: 'requirement', domain: 'AUTH', title: 'next' }, dir);
    assert.equal(id, 'REQ-AUTH-008');
  } finally {
    cleanup();
  }
});

test('mintId disambiguates slug-based ids against existing graph', () => {
  // For api/wf/ent (slug-based), we flag every existing id as taken so
  // a new node with the same slug gets the -02 suffix.
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['API-AUTH-LOGIN'] = makeNode({
      id: 'API-AUTH-LOGIN',
      type: 'api',
      domain: 'AUTH'
    });
    writeGraph(dir, graph);

    const id = mintId(
      { type: 'api', domain: 'AUTH', title: 'POST /auth/login', hint: 'POST-AUTH-LOGIN' },
      dir
    );
    // Slug "POST-AUTH-LOGIN" → API-AUTH-POST-AUTH-LOGIN (no collision with LOGIN).
    // But if hint resolves to LOGIN, we'd get API-AUTH-LOGIN-02.
    assert.notEqual(id, 'API-AUTH-LOGIN');
  } finally {
    cleanup();
  }
});

test('mintId on slug collision produces -02 suffix', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    const graph = emptyGraph();
    graph.nodes['API-AUTH-LOGIN'] = makeNode({
      id: 'API-AUTH-LOGIN',
      type: 'api',
      domain: 'AUTH'
    });
    writeGraph(dir, graph);

    // Pass hint=LOGIN to force slug collision with the existing node.
    const id = mintId(
      { type: 'api', domain: 'AUTH', title: 'login again', hint: 'LOGIN' },
      dir
    );
    assert.equal(id, 'API-AUTH-LOGIN-02');
  } finally {
    cleanup();
  }
});
