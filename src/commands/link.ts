import { loadGraph, saveGraph } from '../graph/store';
import { addRelation } from '../graph/ops';
import { RelationType, RELATION_TYPES } from '../types';
import { emit, fail } from '../output';

export interface LinkOpts {
  pretty?: boolean;
}

export function runLink(fromId: string, toId: string, relation: string, opts: LinkOpts = {}): void {
  if (!RELATION_TYPES.includes(relation as RelationType)) {
    fail(`Unknown relation type: ${relation}`, { allowed: RELATION_TYPES });
  }
  const graph = loadGraph();
  try {
    addRelation(graph, fromId, toId, relation as RelationType);
  } catch (err: unknown) {
    fail((err as Error).message);
  }
  saveGraph(graph);

  emit(
    {
      ok: true,
      from: fromId,
      to: toId,
      relation
    },
    { pretty: opts.pretty }
  );
}
