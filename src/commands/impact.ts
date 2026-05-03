import { analyzeImpact } from '../impact/analyze';
import { emit, fail } from '../output';

export interface ImpactOpts {
  pretty?: boolean;
  depth?: number;
  /**
   * REQ-PV-009: emit just the impacted file paths newline-delimited
   * (explicit + inferred), no JSON wrapper. Lets the agent pipe the
   * output straight into a Read loop without burning tokens narrating
   * JSON keys it doesn't need.
   */
  filesOnly?: boolean;
}

export function runImpact(id: string, opts: ImpactOpts = {}): void {
  const result = analyzeImpact(id, { depth: opts.depth });
  if (result.impacted_nodes.length === 0 && result.warnings.some((w) => w.startsWith('Root node not found'))) {
    fail(`Node not found: ${id}`, { warnings: result.warnings });
  }
  if (opts.filesOnly) {
    const all = [...result.impacted_files, ...result.inferred_files];
    if (all.length > 0) process.stdout.write(`${all.join('\n')}\n`);
    return;
  }
  emit({ ok: true, ...result }, { pretty: opts.pretty });
}
