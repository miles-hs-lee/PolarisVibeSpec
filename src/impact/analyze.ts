import { Coverage, DEFAULT_IMPACT_DEPTH, ImpactResult } from '../types';
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
  const totalNodes = Object.keys(graph.nodes).length;

  if (!getNode(graph, rootId)) {
    return {
      root: rootId,
      depth,
      impacted_nodes: [],
      impacted_files: [],
      inferred_files: [],
      warnings: [`Root node not found: ${rootId}`],
      total_nodes: totalNodes,
      coverage: 'narrow'
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
    warnings: [...traversal.warnings, ...files.warnings],
    total_nodes: totalNodes,
    coverage: classifyCoverage(traversal.visited.length, totalNodes)
  };
}

/**
 * Coverage thresholds tuned against the self-hosted PV graph (28 nodes):
 *   - WF-PV-IMPACT → 2 nodes (≈7%)   → narrow
 *   - REQ-PV-003   → ~10 nodes (≈36%) → broad
 *   - ENT-PV-NODE  → ~22 nodes (≈79%) → global
 *
 * narrow (<25%): trust the file set; agent should not also grep.
 * broad  (25–60%): substantial fraction; consider also grepping.
 * global (>60%):  the root is foundational; agent should be skeptical.
 */
export function classifyCoverage(impactedCount: number, totalNodes: number): Coverage {
  if (totalNodes <= 0) return 'narrow';
  const ratio = impactedCount / totalNodes;
  if (ratio < 0.25) return 'narrow';
  if (ratio <= 0.60) return 'broad';
  return 'global';
}
