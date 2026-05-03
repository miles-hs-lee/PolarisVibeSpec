import { loadGraph } from '../graph/store';
import { search } from '../graph/ops';
import { analyzeImpact } from '../impact/analyze';
import { classifyIntent } from '../compiler/taskShape';
import { AskResult } from '../types';
import { emit, fail } from '../output';

export interface AskOpts {
  pretty?: boolean;
  /** How many query hits to return (default 5). */
  limit?: number;
  /** Override depth for the impact computation on the top hit. */
  depth?: number;
}

/**
 * One-shot agent preamble: classify the intent, search the graph, and run
 * impact on the top hit — all in a single call. Bench-002 showed agents
 * issued three separate PV calls (query/list/impact) before reading any
 * file; this collapses that into one.
 */
export function runAsk(intent: string, opts: AskOpts = {}): void {
  if (!intent || !intent.trim()) {
    fail('Intent is required.');
  }

  const limit = opts.limit && opts.limit > 0 ? opts.limit : 5;

  const graph = loadGraph();
  const classification = classifyIntent(intent);
  const allHits = search(graph, intent);
  const hits = allHits.slice(0, limit);

  let impact: AskResult['impact'] = null;
  if (hits.length > 0) {
    impact = analyzeImpact(hits[0].id, { depth: opts.depth });
  }

  const result: AskResult = { intent, classification, hits, impact };
  emit({ ok: true, ...result }, { pretty: opts.pretty });
}
