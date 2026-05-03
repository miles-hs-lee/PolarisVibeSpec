import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPromote } from '../src/commands/promote';
import { runExportAll } from '../src/commands/exportAll';
import { tmpRepo, writeGraph, readGraph, makeNode, emptyGraph } from './helpers';

/**
 * Mute stdout for the duration of `fn`. PV commands emit JSON to stdout;
 * we don't want it interleaving with test reporter output.
 */
function muted<T>(fn: () => T): T {
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — relaxed signature is fine for muting
  process.stdout.write = () => true;
  try {
    return fn();
  } finally {
    process.stdout.write = orig;
  }
}

function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(orig);
  }
}

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
