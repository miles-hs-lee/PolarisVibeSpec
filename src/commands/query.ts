import { loadGraph } from '../graph/store';
import { search } from '../graph/ops';
import { emit, fail } from '../output';

export interface QueryOpts {
  pretty?: boolean;
  limit?: number;
}

export function runQuery(text: string, opts: QueryOpts = {}): void {
  if (!text || !text.trim()) {
    fail('Query text is required.');
  }
  const graph = loadGraph();
  const hits = search(graph, text);
  const limited = opts.limit && opts.limit > 0 ? hits.slice(0, opts.limit) : hits;

  emit(
    {
      ok: true,
      query: text,
      total: hits.length,
      hits: limited.map((h) => ({
        id: h.id,
        score: h.score,
        title: graph.nodes[h.id]?.title ?? '',
        type: graph.nodes[h.id]?.type ?? '',
        domain: graph.nodes[h.id]?.domain ?? '',
        matched_on: h.matched_on
      }))
    },
    { pretty: opts.pretty }
  );
}
