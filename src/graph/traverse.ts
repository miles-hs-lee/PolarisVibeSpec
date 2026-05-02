import { Graph, RelationType } from '../types';
import { getNode, incoming, outgoing } from './ops';

/**
 * Asymmetric impact traversal — answers "if N changes, who else must change?"
 *
 * Edge direction is interpreted by the semantics of each relation:
 *   - depends_on : reverse  (A depends_on B; if B changes, A must adapt)
 *   - implements : reverse  (A implements B; if requirement B changes, impl A must adapt)
 *   - uses       : reverse  (A uses B; if B changes, caller A must adapt)
 *   - affects    : forward  (A affects B; A explicitly declares it touches B)
 *
 * Depth is capped (default 3) and a visited-set breaks cycles.
 * Missing relation targets become warnings; traversal continues.
 */

const REVERSE: RelationType[] = ['depends_on', 'implements', 'uses'];
const FORWARD: RelationType[] = ['affects'];

export interface TraverseResult {
  visited: string[];
  depth: number;
  warnings: string[];
}

export function impactTraverse(graph: Graph, rootId: string, maxDepth: number): TraverseResult {
  const warnings: string[] = [];
  if (!getNode(graph, rootId)) {
    return { visited: [], depth: 0, warnings: [`Root node not found: ${rootId}`] };
  }

  const visited = new Map<string, number>();
  visited.set(rootId, 0);

  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  let observedMaxDepth = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const node = getNode(graph, id);
    if (!node) continue;

    // Forward edges (affects, uses).
    for (const rel of outgoing(graph, id)) {
      if (!FORWARD.includes(rel.type)) continue;
      const next = rel.target;
      if (!getNode(graph, next)) {
        warnings.push(`Dangling target: ${id} -[${rel.type}]-> ${next}`);
        continue;
      }
      if (!visited.has(next)) {
        visited.set(next, depth + 1);
        observedMaxDepth = Math.max(observedMaxDepth, depth + 1);
        queue.push({ id: next, depth: depth + 1 });
      }
    }

    // Reverse edges (incoming depends_on / implements).
    for (const incomingEdge of incoming(graph, id)) {
      if (!REVERSE.includes(incomingEdge.type)) continue;
      const next = incomingEdge.from;
      if (!visited.has(next)) {
        visited.set(next, depth + 1);
        observedMaxDepth = Math.max(observedMaxDepth, depth + 1);
        queue.push({ id: next, depth: depth + 1 });
      }
    }
  }

  return {
    visited: Array.from(visited.keys()),
    depth: observedMaxDepth,
    warnings
  };
}
