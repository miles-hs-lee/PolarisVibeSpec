import { loadGraph } from '../graph/store';
import { listNodes } from '../graph/ops';
import { emit } from '../output';

export interface ListOpts {
  pretty?: boolean;
  type?: string;
  domain?: string;
}

export function runList(opts: ListOpts = {}): void {
  const graph = loadGraph();
  const nodes = listNodes(graph, { type: opts.type, domain: opts.domain });

  emit(
    {
      ok: true,
      filter: { type: opts.type ?? null, domain: opts.domain ?? null },
      total: nodes.length,
      nodes: nodes
        .map((n) => ({
          id: n.id,
          type: n.type,
          domain: n.domain,
          title: n.title,
          tags: n.tags,
          relation_count: n.relations.length
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    },
    { pretty: opts.pretty }
  );
}
