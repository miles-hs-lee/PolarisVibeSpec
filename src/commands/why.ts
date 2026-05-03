import { loadCodeMap, loadGraph } from '../graph/store';
import { incoming } from '../graph/ops';
import { emit } from '../output';

export interface WhyOpts {
  pretty?: boolean;
}

/**
 * Reverse lookup: given a file path, find every node whose codemap
 * references it and report how the file fits into the graph (what it
 * implements, what nodes it's used by, what entities it touches).
 *
 * The most common code-review question — "what is this file?" — should
 * be a 1-second answer.
 */
export function runWhy(filePath: string, opts: WhyOpts = {}): void {
  const graph = loadGraph();
  const codeMap = loadCodeMap();
  // Normalize: strip leading "./", normalize separators.
  const norm = filePath.replace(/^\.\//, '').replace(/\\/g, '/');

  const matches: Array<{
    id: string;
    type: string;
    domain: string;
    title: string;
    outgoing: Array<{ type: string; target: string; target_title: string }>;
    incoming: Array<{ from: string; type: string; from_title: string }>;
  }> = [];

  for (const [id, files] of Object.entries(codeMap)) {
    if (!files.includes(filePath) && !files.includes(norm)) continue;
    const node = graph.nodes[id];
    if (!node) continue; // codemap orphan (caught separately by validate)
    const inc = incoming(graph, id).map((e) => ({
      from: e.from,
      type: e.type,
      from_title: graph.nodes[e.from]?.title ?? '(missing)'
    }));
    matches.push({
      id,
      type: node.type,
      domain: node.domain,
      title: node.title,
      outgoing: node.relations.map((r) => ({
        type: r.type,
        target: r.target,
        target_title: graph.nodes[r.target]?.title ?? '(missing)'
      })),
      incoming: inc
    });
  }

  if (matches.length === 0) {
    emit(
      {
        ok: true,
        file: filePath,
        matches: [],
        hint:
          'No nodes reference this file in codemap. Run `pv add-file <node-id> ' +
          filePath +
          '` to associate, or `pv validate` to surface orphan source files.'
      },
      { pretty: opts.pretty }
    );
    return;
  }

  emit({ ok: true, file: filePath, matches }, { pretty: opts.pretty });
}
