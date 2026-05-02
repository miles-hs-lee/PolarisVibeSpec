import { Graph, CodeMap, Counters } from '../types';
import { readJsonIfExists, writeJsonAtomic } from '../util/atomic';
import { graphPath, codeMapPath, countersPath } from '../util/paths';

const EMPTY_GRAPH: Graph = { version: 1, nodes: {} };

export function loadGraph(cwd?: string): Graph {
  const g = readJsonIfExists<Graph>(graphPath(cwd), EMPTY_GRAPH);
  if (!g.nodes) return { version: 1, nodes: {} };
  return g;
}

export function saveGraph(graph: Graph, cwd?: string): void {
  writeJsonAtomic(graphPath(cwd), graph);
}

export function loadCodeMap(cwd?: string): CodeMap {
  return readJsonIfExists<CodeMap>(codeMapPath(cwd), {});
}

export function saveCodeMap(map: CodeMap, cwd?: string): void {
  writeJsonAtomic(codeMapPath(cwd), map);
}

export function loadCounters(cwd?: string): Counters {
  return readJsonIfExists<Counters>(countersPath(cwd), {});
}

export function saveCounters(counters: Counters, cwd?: string): void {
  writeJsonAtomic(countersPath(cwd), counters);
}
