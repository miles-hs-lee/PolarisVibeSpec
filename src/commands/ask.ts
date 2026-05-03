import { loadGraph } from '../graph/store';
import { search } from '../graph/ops';
import { analyzeImpact } from '../impact/analyze';
import { classifyIntent } from '../compiler/taskShape';
import { AskResult } from '../types';
import { logUsage } from '../util/usage';
import { emit, fail } from '../output';

export interface AskOpts {
  pretty?: boolean;
  /** How many query hits to return (default 5). */
  limit?: number;
  /** Override depth for the impact computation on the top hit. */
  depth?: number;
  /**
   * REQ-PV-009: tight JSON output {recommendation, reason, files, root,
   * coverage} instead of the full AskResult. When the recommendation is
   * `use_grep`, files is empty — the agent learns to skip PV without
   * having to parse hits or impacted_nodes.
   */
  minimal?: boolean;
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

  // Best-effort usage log so `pv stats` can show the user a numeric
  // handle on their own routing patterns over time.
  logUsage({
    ts: new Date().toISOString(),
    intent,
    recommendation: classification.recommendation,
    shape: classification.shape,
    coverage: impact?.coverage ?? null,
    impacted_count: impact?.impacted_files.length ?? 0,
    total_nodes: impact?.total_nodes ?? 0,
    read_set_ratio: impact?.read_set_ratio ?? null
  });

  if (opts.minimal) {
    // Minimal payload: when recommendation is use_grep, files is empty
    // so the agent learns "skip PV" with the smallest possible response.
    const useFiles = classification.recommendation !== 'use_grep' && impact;
    emit(
      {
        recommendation: classification.recommendation,
        reason: classification.reason,
        root: impact?.root ?? null,
        coverage: impact?.coverage ?? null,
        files: useFiles ? impact!.impacted_files : []
      },
      { pretty: opts.pretty }
    );
    return;
  }

  const result: AskResult = { intent, classification, hits, impact };
  emit({ ok: true, ...result }, { pretty: opts.pretty });
}
