import { Graph, NodeType, RelationType, SpecNode } from '../types';

/**
 * Render the graph (or a filtered subset) as a Mermaid or Graphviz
 * diagram. Mermaid renders natively in GitHub markdown; Graphviz piped
 * into `dot` produces SVG/PNG for richer architecture diagrams.
 *
 * Filters: --domain narrows to nodes in one domain; --node + --depth
 * builds a subgraph centered on a single id (BFS in both directions).
 */

export type DiagramFormat = 'mermaid' | 'graphviz';

export interface DiagramOpts {
  format?: DiagramFormat;
  domain?: string;
  rootId?: string;
  /** When rootId is set, BFS depth in both directions (default 2). */
  depth?: number;
}

export function buildDiagram(graph: Graph, opts: DiagramOpts = {}): string {
  const fmt: DiagramFormat = opts.format || 'mermaid';
  const nodes = filterNodes(graph, opts);
  return fmt === 'graphviz'
    ? renderGraphviz(graph, nodes)
    : renderMermaid(graph, nodes);
}

function filterNodes(graph: Graph, opts: DiagramOpts): SpecNode[] {
  if (opts.rootId) {
    const depth = opts.depth ?? 2;
    if (!graph.nodes[opts.rootId]) return [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: opts.rootId, d: 0 }];
    while (queue.length) {
      const { id, d } = queue.shift()!;
      if (visited.has(id) || !graph.nodes[id]) continue;
      visited.add(id);
      if (d >= depth) continue;
      for (const r of graph.nodes[id].relations) queue.push({ id: r.target, d: d + 1 });
      for (const n of Object.values(graph.nodes)) {
        for (const r of n.relations) {
          if (r.target === id && !visited.has(n.id)) queue.push({ id: n.id, d: d + 1 });
        }
      }
    }
    return Array.from(visited)
      .map((id) => graph.nodes[id])
      .filter(Boolean);
  }
  let list = Object.values(graph.nodes);
  if (opts.domain) list = list.filter((n) => n.domain === opts.domain);
  return list;
}

// --- Mermaid -------------------------------------------------------------

const MERMAID_SHAPES: Record<NodeType, [string, string]> = {
  requirement: ['(("', '"))'],   // round
  entity:      ['[("', '")]'],   // cylinder
  workflow:    ['{{"', '"}}'],   // hexagon
  api:         ['["',  '"]']     // rectangle (default)
};

const MERMAID_ARROWS: Record<RelationType, string> = {
  implements: '-.->',  // dashed
  uses:       '-->',
  affects:    '==>',   // thick
  depends_on: '-->'
};

function escapeMermaidLabel(s: string): string {
  return s.replace(/[\[\]"`]/g, '');
}

function renderMermaid(graph: Graph, nodes: SpecNode[]): string {
  const ids = new Set(nodes.map((n) => n.id));
  const lines = ['graph TD'];
  for (const n of nodes) {
    const [open, close] = MERMAID_SHAPES[n.type];
    lines.push(`  ${n.id}${open}${escapeMermaidLabel(n.id)}<br/>${escapeMermaidLabel(n.title)}${close}`);
  }
  lines.push('');
  for (const n of nodes) {
    for (const r of n.relations) {
      if (!ids.has(r.target)) continue;
      const arrow = MERMAID_ARROWS[r.type];
      lines.push(`  ${n.id} ${arrow}|${r.type}| ${r.target}`);
    }
  }
  return lines.join('\n') + '\n';
}

// --- Graphviz -------------------------------------------------------------

const DOT_FILL: Record<NodeType, string> = {
  requirement: 'lightblue',
  entity:      'lightyellow',
  workflow:    'lightgreen',
  api:         'white'
};

function dotEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function renderGraphviz(graph: Graph, nodes: SpecNode[]): string {
  const ids = new Set(nodes.map((n) => n.id));
  const lines = [
    'digraph G {',
    '  rankdir=LR;',
    '  node [shape=box, style="filled,rounded", fontname="Helvetica"];',
    '  edge [fontname="Helvetica", fontsize=10];',
    ''
  ];
  for (const n of nodes) {
    const fill = DOT_FILL[n.type];
    lines.push(`  "${n.id}" [label="${dotEscape(n.id)}\\n${dotEscape(n.title)}", fillcolor=${fill}];`);
  }
  lines.push('');
  for (const n of nodes) {
    for (const r of n.relations) {
      if (!ids.has(r.target)) continue;
      const style = r.type === 'implements' ? ', style=dashed' : r.type === 'affects' ? ', penwidth=2' : '';
      lines.push(`  "${n.id}" -> "${r.target}" [label="${r.type}"${style}];`);
    }
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}
