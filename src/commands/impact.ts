import { analyzeImpact } from '../impact/analyze';
import { emit, fail } from '../output';

export interface ImpactOpts {
  pretty?: boolean;
  depth?: number;
}

export function runImpact(id: string, opts: ImpactOpts = {}): void {
  const result = analyzeImpact(id, { depth: opts.depth });
  if (result.impacted_nodes.length === 0 && result.warnings.some((w) => w.startsWith('Root node not found'))) {
    fail(`Node not found: ${id}`, { warnings: result.warnings });
  }
  emit({ ok: true, ...result }, { pretty: opts.pretty });
}
