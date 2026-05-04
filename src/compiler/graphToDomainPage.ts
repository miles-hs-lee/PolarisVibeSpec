import { CodeMap, Graph, NodeType, SpecNode } from '../types';
import { buildDiagram } from './graphToDiagram';

/**
 * Render a single domain as a *narrative* page — all that domain's nodes
 * grouped by type with inline descriptions, internal anchors, and an
 * embedded Mermaid diagram. The complement to the per-id `spec/<id>.md`
 * pages: those serve PR-diff granularity and `pv promote` round-trip;
 * this one serves the human reading "tell me what AUTH does".
 *
 * For a single-domain project this becomes the primary read. For
 * multi-domain projects you get one page per domain plus a README index.
 */

const TYPE_HEADINGS: Record<NodeType, string> = {
  requirement: 'Requirements',
  api: 'APIs',
  workflow: 'Workflows',
  entity: 'Entities'
};

const TYPE_ORDER: NodeType[] = ['requirement', 'api', 'workflow', 'entity'];

const RELATION_VERBS: Record<string, string> = {
  implements: 'Implements',
  uses: 'Uses',
  affects: 'Affects',
  depends_on: 'Depends on'
};

export interface DomainPageOpts {
  /** Embed `pv diagram --domain <X>` Mermaid output at the top. Default: true. */
  includeDiagram?: boolean;
  /** Truncate node descriptions to this many chars (sentence-aware). */
  maxDescriptionChars?: number;
}

const DEFAULT_MAX_DESC = 500;

export function graphToDomainPage(
  domain: string,
  graph: Graph,
  codemap: CodeMap,
  opts: DomainPageOpts = {}
): string {
  const includeDiagram = opts.includeDiagram !== false;
  const maxDesc = opts.maxDescriptionChars ?? DEFAULT_MAX_DESC;

  const nodesInDomain = Object.values(graph.nodes).filter((n) => n.domain === domain);
  if (nodesInDomain.length === 0) {
    return `# ${domain} domain\n\n_(no nodes in this domain)_\n`;
  }

  const lines: string[] = [];

  lines.push(`# ${domain} domain`);
  lines.push('');
  lines.push(buildSummaryLine(nodesInDomain, codemap));
  lines.push('');

  if (includeDiagram) {
    const diagram = buildDiagram(graph, { format: 'mermaid', domain });
    if (diagram.trim()) {
      lines.push('```mermaid');
      lines.push(diagram.trim());
      lines.push('```');
      lines.push('');
    }
  }

  const byType = groupByType(nodesInDomain);
  for (const type of TYPE_ORDER) {
    const list = byType.get(type);
    if (!list || list.length === 0) continue;
    lines.push(`## ${TYPE_HEADINGS[type]} (${list.length})`);
    lines.push('');
    for (const node of list) {
      appendNodeBlock(lines, node, graph, codemap, maxDesc);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `_Per-node detail pages: see ${nodesInDomain
      .map((n) => `[\`${n.id}\`](${n.id}.md)`)
      .slice(0, 12)
      .join(', ')}${nodesInDomain.length > 12 ? ', …' : ''}_`
  );
  return lines.join('\n') + '\n';
}

// Type-aware plurals so "1 entity / 5 entities / 1 API / 24 APIs" reads
// naturally instead of "5 entitys / 24 apis".
const TYPE_PLURAL: Record<NodeType, [string, string]> = {
  requirement: ['requirement', 'requirements'],
  api:         ['API', 'APIs'],
  workflow:    ['workflow', 'workflows'],
  entity:      ['entity', 'entities']
};

function buildSummaryLine(nodes: SpecNode[], codemap: CodeMap): string {
  const counts = new Map<NodeType, number>();
  for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const ids = new Set(nodes.map((n) => n.id));
  let codemapFiles = 0;
  for (const id of ids) {
    codemapFiles += (codemap[id] ?? []).length;
  }
  const parts: string[] = [];
  for (const t of TYPE_ORDER) {
    const c = counts.get(t);
    if (c) {
      const [sg, pl] = TYPE_PLURAL[t];
      parts.push(`${c} ${c === 1 ? sg : pl}`);
    }
  }
  parts.push(`${codemapFiles} codemap file${codemapFiles === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function groupByType(nodes: SpecNode[]): Map<NodeType, SpecNode[]> {
  const out = new Map<NodeType, SpecNode[]>();
  for (const n of nodes) {
    const list = out.get(n.type) ?? [];
    list.push(n);
    out.set(n.type, list);
  }
  // Sort each type's list by id for stable output.
  for (const list of out.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function appendNodeBlock(
  lines: string[],
  node: SpecNode,
  graph: Graph,
  codemap: CodeMap,
  maxDesc: number
): void {
  lines.push(`### \`${node.id}\` — ${node.title}`);
  lines.push('');
  if (node.description) {
    lines.push(`> ${truncateAtSentence(node.description, maxDesc)}`);
    lines.push('');
  }

  const meta: string[] = [];
  if (node.tags.length > 0) {
    meta.push(`Tags: ${node.tags.map((t) => `\`${t}\``).join(', ')}`);
  }

  // Group outgoing relations by type for terse rendering.
  const byRel = new Map<string, string[]>();
  for (const rel of node.relations) {
    const list = byRel.get(rel.type) ?? [];
    list.push(rel.target);
    byRel.set(rel.type, list);
  }
  for (const [relType, targets] of byRel) {
    const verb = RELATION_VERBS[relType] ?? relType;
    const targetLinks = targets.map((t) => renderTargetLink(t, graph)).join(', ');
    meta.push(`${verb}: ${targetLinks}`);
  }

  // Incoming (in-domain only — keeps the page focused).
  const incoming = collectIncomingInDomain(graph, node);
  if (incoming.length > 0) {
    const incomingLinks = incoming
      .map(({ from, type }) => {
        const verb = RELATION_VERBS[type] ?? type;
        return `[\`${from}\`](#${anchorOf(from)}) (${verb.toLowerCase()})`;
      })
      .join(', ');
    meta.push(`Incoming: ${incomingLinks}`);
  }

  const files = codemap[node.id] ?? [];
  if (files.length > 0) {
    const fileList = files.map((f) => `\`${f}\``).join(', ');
    meta.push(`Files: ${fileList}`);
  }

  for (const m of meta) {
    lines.push(`- ${m}`);
  }
  if (meta.length > 0) lines.push('');
}

function renderTargetLink(targetId: string, graph: Graph): string {
  const node = graph.nodes[targetId];
  if (!node) return `[\`${targetId}\`](${targetId}.md) _(missing)_`;
  // Same-domain → in-page anchor; cross-domain → link out to the
  // sibling domain page (assumes same spec/ dir).
  return `[\`${targetId}\`](#${anchorOf(targetId)})`;
}

function collectIncomingInDomain(
  graph: Graph,
  node: SpecNode
): Array<{ from: string; type: string }> {
  const out: Array<{ from: string; type: string }> = [];
  for (const other of Object.values(graph.nodes)) {
    if (other.domain !== node.domain) continue;
    for (const rel of other.relations) {
      if (rel.target === node.id) out.push({ from: other.id, type: rel.type });
    }
  }
  return out;
}

/** GitHub auto-anchor format for headings: lowercase, `-` for spaces. */
function anchorOf(id: string): string {
  return id.toLowerCase();
}

/** Cut at the nearest sentence boundary near `max` chars. */
export function truncateAtSentence(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  const slice = oneLine.slice(0, max);
  const lastPeriod = slice.lastIndexOf('. ');
  const cut = lastPeriod > max * 0.5 ? lastPeriod + 1 : max;
  return `${oneLine.slice(0, cut).trim()} …`;
}
