/**
 * Build a Markdown prompt for an LLM agent to perform semantic
 * alignment between a PRD and the Intent graph.
 *
 * PV does not call the LLM itself — the user runs the emitted prompt
 * through their own agent (Claude Code, Codex, etc.) and reviews the
 * structured JSON the agent returns. Layer 3 of the three-layer check
 * model documented in docs/PRD-DESIGN.md.
 */

import { Graph, SpecNode, CodeMap } from '../types';
import { incoming, outgoing } from '../graph/ops';
import { ParsedPrd, PrdSection } from './parse';

export interface PromptBuildOptions {
  /** Include 1-hop neighbors of linked Intents in each section's context. */
  includeNeighbors?: boolean;
}

export function buildPrompt(
  parsed: ParsedPrd,
  graph: Graph,
  codemap: CodeMap,
  opts: PromptBuildOptions = {}
): string {
  const lines: string[] = [];
  const includeNeighbors = opts.includeNeighbors !== false; // default on

  lines.push(`# Drift check: ${parsed.path}`);
  lines.push('');
  lines.push(
    'You are checking a Product Requirements Document (PRD) against the Intent graph that describes the codebase. Your job: find places where the PRD makes claims that aren\'t reflected in the Intent graph, or vice versa.'
  );
  lines.push('');
  lines.push('Be conservative. Only flag concrete divergences. Surface-level paraphrasing is not drift.');
  lines.push('');

  if (parsed.sections.length === 0 || parsed.sections.every((s) => s.intents.length === 0)) {
    // Whole-file mode: no section directives, fall back to frontmatter intents.
    appendWholeFileBlock(lines, parsed, graph, codemap, includeNeighbors);
  } else {
    // Section-by-section mode.
    parsed.sections.forEach((section, i) => {
      appendSectionBlock(lines, section, i + 1, parsed.sections.length, graph, codemap, includeNeighbors);
    });
  }

  appendOutputSpec(lines);
  return lines.join('\n');
}

function appendWholeFileBlock(
  lines: string[],
  parsed: ParsedPrd,
  graph: Graph,
  codemap: CodeMap,
  includeNeighbors: boolean
): void {
  lines.push('## PRD content');
  lines.push('');
  lines.push('(no section directives found — analyzing as a single document)');
  lines.push('');
  // Without the body the LLM only sees metadata and can't actually
  // judge "drift between prose and Intents." Strip directives so the
  // model isn't tempted to follow our internal markers.
  const proseBody = stripDirectives(parsed.body).trim();
  if (proseBody) {
    lines.push(proseBody);
    lines.push('');
  }
  lines.push('### Linked Intents');
  lines.push('');
  const linked = parsed.frontmatterIntents.length > 0
    ? parsed.frontmatterIntents
    : parsed.references.filter((r) => r.source === 'body').map((r) => r.id);

  if (linked.length === 0) {
    lines.push('_No Intents linked. The agent should infer relevance from prose._');
  } else {
    appendIntentList(lines, linked, graph, codemap, includeNeighbors);
  }

  lines.push('');
  lines.push('### Question');
  lines.push('');
  lines.push('Identify drift between the entire PRD prose and the linked Intent nodes.');
  lines.push('');
}

function appendSectionBlock(
  lines: string[],
  section: PrdSection,
  index: number,
  total: number,
  graph: Graph,
  codemap: CodeMap,
  includeNeighbors: boolean
): void {
  lines.push(`## Section ${index}/${total}: ${section.heading}`);
  if (section.claim) {
    lines.push(`_claim id: ${section.claim}_`);
  }
  lines.push('');
  lines.push('### PRD content');
  lines.push('');
  lines.push(stripDirectives(section.body).trim());
  lines.push('');
  lines.push('### Linked Intents');
  lines.push('');
  if (section.intents.length === 0) {
    lines.push('_(no `<!-- pv-intents: -->` directive in this section — agent should note if this section makes claims that need linking)_');
  } else {
    appendIntentList(lines, section.intents, graph, codemap, includeNeighbors);
  }

  lines.push('');
  lines.push('### Question');
  lines.push('');
  lines.push('1. Does the PRD section make concrete claims not represented in the linked Intents?');
  lines.push('2. Do the linked Intents contradict any claim in the section?');
  lines.push('3. Are there terms used differently between the section and Intents (synonyms)?');
  lines.push('');
}

function appendIntentList(
  lines: string[],
  ids: string[],
  graph: Graph,
  codemap: CodeMap,
  includeNeighbors: boolean
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    appendOneIntent(lines, id, graph, codemap, seen);
    if (includeNeighbors) {
      for (const neighbor of neighborsOf(graph, id)) {
        if (!seen.has(neighbor)) {
          appendOneIntent(lines, neighbor, graph, codemap, seen, true);
        }
      }
    }
  }
}

function appendOneIntent(
  lines: string[],
  id: string,
  graph: Graph,
  codemap: CodeMap,
  seen: Set<string>,
  isNeighbor = false
): void {
  if (seen.has(id)) return;
  seen.add(id);
  const node = graph.nodes[id];
  if (!node) {
    lines.push(`- **${id}** _(does not exist in graph — dangling reference)_`);
    return;
  }
  const tag = isNeighbor ? ' _(neighbor)_' : '';
  lines.push(`- **${id}** — ${node.title}${tag}`);
  if (node.description) {
    lines.push(`  - description: ${oneLine(node.description)}`);
  }
  if (node.tags.length > 0) {
    lines.push(`  - tags: ${node.tags.join(', ')}`);
  }
  const files = codemap[id];
  if (files && files.length > 0) {
    lines.push(`  - codemap: ${files.join(', ')}`);
  }
  if (node.relations.length > 0) {
    const rels = node.relations.map((r) => `${r.type} → ${r.target}`).join('; ');
    lines.push(`  - outgoing: ${rels}`);
  }
}

function neighborsOf(graph: Graph, id: string): string[] {
  const out = new Set<string>();
  for (const r of outgoing(graph, id)) out.add(r.target);
  for (const r of incoming(graph, id)) out.add(r.from);
  return Array.from(out);
}

function appendOutputSpec(lines: string[]): void {
  lines.push('---');
  lines.push('');
  lines.push('## Output format');
  lines.push('');
  lines.push('Return a single JSON object with this shape:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "sections": [');
  lines.push('    {');
  lines.push('      "section": "<heading or \'whole-document\'>",');
  lines.push('      "missing_in_graph": [');
  lines.push('        {"claim": "<paraphrased claim>", "evidence": "<line refs or quote>"}');
  lines.push('      ],');
  lines.push('      "contradictions": [');
  lines.push('        {"intent": "<id>", "section_claim": "...", "conflict": "..."}');
  lines.push('      ],');
  lines.push('      "synonym_pairs": [');
  lines.push('        {"prd_term": "...", "graph_term": "...", "graph_node": "<id>"}');
  lines.push('      ],');
  lines.push('      "graph_concepts_unmentioned": [');
  lines.push('        {"intent": "<id>", "why_relevant": "..."}');
  lines.push('      ]');
  lines.push('    }');
  lines.push('  ]');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Empty arrays are fine. Do not emit speculation: leave fields empty if uncertain.');
  lines.push('');
}

function stripDirectives(body: string): string {
  return body.replace(/<!--\s*pv-(intents|claim|status):[\s\S]*?-->/g, '').trim();
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
