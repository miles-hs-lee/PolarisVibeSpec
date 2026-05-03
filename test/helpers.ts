import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Graph, CodeMap, SpecNode } from '../src/types';

/**
 * Each test gets its own throwaway dir under the OS temp root, used as
 * the `cwd` for PV operations. PV reads/writes `.polaris/*.json` relative
 * to cwd, so tmpRepo() + cleanup() gives full isolation.
 */
export function tmpRepo(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-test-'));
  fs.mkdirSync(path.join(dir, '.polaris'), { recursive: true });
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

export function writeGraph(dir: string, graph: Graph): void {
  fs.writeFileSync(path.join(dir, '.polaris', 'graph.json'), JSON.stringify(graph));
}

export function writeCodemap(dir: string, map: CodeMap): void {
  fs.writeFileSync(path.join(dir, '.polaris', 'codemap.json'), JSON.stringify(map));
}

export function readGraph(dir: string): Graph {
  return JSON.parse(fs.readFileSync(path.join(dir, '.polaris', 'graph.json'), 'utf8'));
}

export function makeNode(overrides: Partial<SpecNode> & Pick<SpecNode, 'id' | 'type' | 'domain'>): SpecNode {
  return {
    title: overrides.id,
    description: '',
    tags: [],
    relations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

export function emptyGraph(): Graph {
  return { version: 1, nodes: {} };
}

/** Initialize a git repo at `dir` and commit the current state. */
export function gitInitAndCommit(dir: string, message = 'initial'): void {
  const opts = { cwd: dir, stdio: 'pipe' as const };
  execFileSync('git', ['init', '-q'], opts);
  execFileSync('git', ['config', 'user.email', 'test@test'], opts);
  execFileSync('git', ['config', 'user.name', 'test'], opts);
  execFileSync('git', ['add', '-A'], opts);
  execFileSync('git', ['commit', '-q', '-m', message], opts);
}

/** Mute stdout for the duration of `fn`. PV commands emit JSON; we
 *  don't want it interleaving with the test reporter. */
export function muted<T>(fn: () => T): T {
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — relaxed signature is fine for muting
  process.stdout.write = () => true;
  try {
    return fn();
  } finally {
    process.stdout.write = orig;
  }
}

/** Capture stdout from `fn`, returning the captured string + the
 *  function's return value. */
export function captured<T>(fn: () => T): { out: string; result: T } {
  const orig = process.stdout.write.bind(process.stdout);
  let out = '';
  // @ts-expect-error
  process.stdout.write = (chunk: string | Buffer) => {
    out += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };
  try {
    const result = fn();
    return { out, result };
  } finally {
    process.stdout.write = orig;
  }
}

export function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(orig);
  }
}

/** Run `fn` and capture any process.exit() call as a thrown sentinel
 *  with the exit code. PV's `fail()` and exit-on-drift commands call
 *  process.exit; tests need to observe the code without terminating. */
export class ProcessExit extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}
export function expectExit<T>(fn: () => T): { code: number | undefined; ranToCompletion: boolean; result?: T } {
  const origExit = process.exit;
  const origStderr = process.stderr.write.bind(process.stderr);
  // Silence error JSON.
  // @ts-expect-error
  process.stderr.write = () => true;
  // @ts-expect-error
  process.exit = (code?: number) => { throw new ProcessExit(code); };
  try {
    const result = fn();
    return { code: undefined, ranToCompletion: true, result };
  } catch (e) {
    if (e instanceof ProcessExit) {
      return { code: e.code, ranToCompletion: false };
    }
    throw e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
  }
}
