import { loadGraph, saveGraph } from '../graph/store';
import { addNode } from '../graph/ops';
import { intentToGraph } from '../compiler/intentToGraph';
import { emit, fail } from '../output';

export interface GenerateOpts {
  pretty?: boolean;
  llm?: boolean;
}

export function runGenerate(intent: string, opts: GenerateOpts = {}): void {
  if (!intent || !intent.trim()) {
    fail('Intent is required.');
  }

  const graph = loadGraph();
  const result = intentToGraph(intent, graph, { llm: opts.llm });

  if (result.nodes.length === 0) {
    fail('No nodes produced from intent.', { notes: result.notes });
  }

  for (const node of result.nodes) {
    addNode(graph, node);
  }
  saveGraph(graph);

  emit(
    {
      ok: true,
      created: result.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        domain: n.domain,
        title: n.title,
        tags: n.tags,
        relations: n.relations
      })),
      auto_relations: result.newRelations,
      notes: result.notes
    },
    { pretty: opts.pretty }
  );
}
