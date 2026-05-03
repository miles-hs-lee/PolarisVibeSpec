import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { runAddFile } from '../src/commands/addFile';
import { runRmFile } from '../src/commands/rmFile';
import {
  tmpRepo, writeGraph, writeCodemap, makeNode, emptyGraph,
  withCwd, captured, expectExit, muted
} from './helpers';

function readCodemap(dir: string): Record<string, string[]> {
  return JSON.parse(fs.readFileSync(path.join(dir, '.polaris', 'codemap.json'), 'utf8'));
}

function setup(dir: string) {
  const g = emptyGraph();
  g.nodes['API-X-FOO'] = makeNode({ id: 'API-X-FOO', type: 'api', domain: 'X' });
  writeGraph(dir, g);
  writeCodemap(dir, {});
}

test('runAddFile: adds a file to a node codemap', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    withCwd(dir, () => muted(() => runAddFile('API-X-FOO', 'src/foo.ts')));

    const map = readCodemap(dir);
    assert.deepEqual(map['API-X-FOO'], ['src/foo.ts']);
  } finally {
    cleanup();
  }
});

test('runAddFile: appends to existing list, deduped', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    writeCodemap(dir, { 'API-X-FOO': ['src/foo.ts'] });

    withCwd(dir, () => muted(() => runAddFile('API-X-FOO', 'src/bar.ts')));
    withCwd(dir, () => muted(() => runAddFile('API-X-FOO', 'src/foo.ts')));

    const map = readCodemap(dir);
    assert.deepEqual(map['API-X-FOO'].sort(), ['src/bar.ts', 'src/foo.ts']);
  } finally {
    cleanup();
  }
});

test('runAddFile: rejects unknown node id', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    let exitCode: number | undefined;
    withCwd(dir, () => captured(() => {
      const r = expectExit(() => runAddFile('API-X-GHOST', 'src/foo.ts'));
      exitCode = r.code;
    }));
    assert.equal(exitCode, 1);

    const map = readCodemap(dir);
    assert.equal(map['API-X-GHOST'], undefined, 'codemap untouched');
  } finally {
    cleanup();
  }
});

test('runAddFile: normalizes Windows-style paths to POSIX', () => {
  // codemap is stored with POSIX separators per docs/ARCHITECTURE.md.
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);

    withCwd(dir, () => muted(() => runAddFile('API-X-FOO', 'src\\foo\\bar.ts')));

    const map = readCodemap(dir);
    assert.deepEqual(map['API-X-FOO'], ['src/foo/bar.ts']);
  } finally {
    cleanup();
  }
});

test('runRmFile: removes the path', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    writeCodemap(dir, { 'API-X-FOO': ['src/a.ts', 'src/b.ts'] });

    withCwd(dir, () => muted(() => runRmFile('API-X-FOO', 'src/a.ts')));

    const map = readCodemap(dir);
    assert.deepEqual(map['API-X-FOO'], ['src/b.ts']);
  } finally {
    cleanup();
  }
});

test('runRmFile: removing the last file deletes the entry entirely', () => {
  // Documented behavior: when a node has no remaining files, the
  // codemap entry is dropped rather than left as an empty array. This
  // keeps the codemap from accumulating dead keys.
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    writeCodemap(dir, { 'API-X-FOO': ['src/a.ts'] });

    withCwd(dir, () => muted(() => runRmFile('API-X-FOO', 'src/a.ts')));

    const map = readCodemap(dir);
    assert.equal(map['API-X-FOO'], undefined, 'entry deleted, not left empty');
  } finally {
    cleanup();
  }
});

test('runRmFile: removing a path that was never there is a no-op (no error)', () => {
  const { dir, cleanup } = tmpRepo();
  try {
    setup(dir);
    writeCodemap(dir, { 'API-X-FOO': ['src/a.ts'] });

    withCwd(dir, () => muted(() => runRmFile('API-X-FOO', 'src/never.ts')));

    const map = readCodemap(dir);
    assert.deepEqual(map['API-X-FOO'], ['src/a.ts'], 'unchanged');
  } finally {
    cleanup();
  }
});
