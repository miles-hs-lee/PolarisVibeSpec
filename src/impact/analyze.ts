import { DEFAULT_IMPACT_DEPTH, ImpactResult } from '../types';
import { loadCodeMap, loadGraph } from '../graph/store';
import { impactTraverse } from '../graph/traverse';
import { resolveFilesForNodes } from '../context/codeMap';
import { getNode } from '../graph/ops';

export interface AnalyzeOptions {
  depth?: number;
  cwd?: string;
}

export function analyzeImpact(rootId: string, opts: AnalyzeOptions = {}): ImpactResult {
  const depth = opts.depth ?? DEFAULT_IMPACT_DEPTH;
  const cwd = opts.cwd ?? process.cwd();

  const graph = loadGraph(cwd);
  const codeMap = loadCodeMap(cwd);

  if (!getNode(graph, rootId)) {
    return {
      root: rootId,
      depth,
      impacted_nodes: [],
      impacted_files: [],
      inferred_files: [],
      warnings: [`Root node not found: ${rootId}`]
    };
  }

  const traversal = impactTraverse(graph, rootId, depth);
  const files = resolveFilesForNodes(graph, traversal.visited, codeMap, cwd);

  return {
    root: rootId,
    depth,
    impacted_nodes: traversal.visited,
    impacted_files: files.explicit,
    inferred_files: files.inferred,
    warnings: [...traversal.warnings, ...files.warnings]
  };
}
