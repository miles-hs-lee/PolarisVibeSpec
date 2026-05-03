import { readUsage, UsageEntry } from '../util/usage';
import { emit } from '../output';

export interface StatsOpts {
  pretty?: boolean;
  /** Only count entries from this date onward (ISO string). */
  since?: string;
}

interface Bucket {
  count: number;
}

export function runStats(opts: StatsOpts = {}): void {
  const all = readUsage();
  const sinceTs = opts.since ? Date.parse(opts.since) : null;

  const entries = sinceTs
    ? all.filter((e) => Date.parse(e.ts) >= sinceTs)
    : all;

  if (entries.length === 0) {
    emit(
      {
        ok: true,
        total: 0,
        message:
          'No `pv ask` usage logged yet. The log is written to .polaris/usage.jsonl on each invocation.'
      },
      { pretty: opts.pretty }
    );
    return;
  }

  const byRecommendation = bucket(entries, (e) => e.recommendation);
  const byShape = bucket(entries, (e) => e.shape);
  const byCoverage = bucket(entries, (e) => e.coverage ?? 'n/a');

  const ratios = entries
    .map((e) => e.read_set_ratio)
    .filter((r): r is number => typeof r === 'number');
  const avgRatio = ratios.length > 0
    ? ratios.reduce((a, b) => a + b, 0) / ratios.length
    : null;

  const impactCounts = entries
    .map((e) => e.impacted_count)
    .filter((n) => n > 0);
  const avgImpacted = impactCounts.length > 0
    ? impactCounts.reduce((a, b) => a + b, 0) / impactCounts.length
    : null;

  const firstTs = entries[0]?.ts;
  const lastTs = entries[entries.length - 1]?.ts;

  emit(
    {
      ok: true,
      total: entries.length,
      window: { from: firstTs, to: lastTs, since: opts.since ?? null },
      by_recommendation: byRecommendation,
      by_shape: byShape,
      by_coverage: byCoverage,
      avg_impacted_files: avgImpacted !== null ? round2(avgImpacted) : null,
      avg_read_set_ratio: avgRatio !== null ? round4(avgRatio) : null,
      hint:
        avgRatio !== null
          ? `Agent reads ~${(avgRatio * 100).toFixed(1)}% of source files per PV-routed task on average.`
          : null
    },
    { pretty: opts.pretty }
  );
}

function bucket<T>(entries: T[], key: (e: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const k = key(e);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
