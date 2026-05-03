import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
