import { loadGraph, saveGraph } from '../graph/store';
import { addNode } from '../graph/ops';
import { intentToGraph } from '../compiler/intentToGraph';
import { buildGeneratePrompt } from '../compiler/promptTemplate';
import { emit, fail } from '../output';

export interface GenerateOpts {
  pretty?: boolean;
  llm?: boolean;
  /**
   * Emit a prompt for an external coding agent (Claude Code, Codex, ...)
   * to follow, instead of running the heuristic compiler. Lets the agent
   * use semantic understanding and Edit tools directly on .polaris/graph.json
   * — PV doesn't manage API keys or models.
   */
  prompt?: boolean;
}

export function runGenerate(intent: string, opts: GenerateOpts = {}): void {
  if (!intent || !intent.trim()) {
    fail('Intent is required.');
  }

  const graph = loadGraph();

  if (opts.prompt) {
    process.stdout.write(buildGeneratePrompt(intent.trim(), graph));
    return;
  }

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
