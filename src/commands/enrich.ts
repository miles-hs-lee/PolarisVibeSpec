import { loadCodeMap, loadGraph } from '../graph/store';
import { getNode } from '../graph/ops';
import { buildEnrichPrompt } from '../compiler/promptTemplate';
import { fail } from '../output';

export interface EnrichOpts {
  /**
   * --prompt is the only mode for now. Without it the command exits with a
   * usage message — enrichment without an LLM doesn't make sense (the whole
   * point is for an agent to read the code and rewrite the description).
   */
  prompt?: boolean;
}

export function runEnrich(id: string, opts: EnrichOpts = {}): void {
  if (!opts.prompt) {
    fail(
      '`pv enrich` currently only supports --prompt mode (use your coding agent to do the enrichment).',
      { hint: 'Run: pv enrich <id> --prompt | <pipe to agent or paste manually>' }
    );
  }

  const graph = loadGraph();
  const node = getNode(graph, id);
  if (!node) {
    fail(`Node not found: ${id}`);
  }

  const codeMap = loadCodeMap();
  const files = codeMap[id] ?? [];

  process.stdout.write(buildEnrichPrompt(node!, graph, files));
}
