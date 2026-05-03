/**
 * `pv review [<base>] --prompt` — Layer-3 sibling of `pv changed`.
 *
 * `pv changed` reports structural drift (orphan, broken codemap, linked
 * nodes). `pv review` takes the same diff and emits a Markdown prompt
 * for the user's coding agent to perform a *semantic* review:
 *
 *   - Does the code change imply a new Intent node?
 *   - Should a linked Intent's description be revised?
 *   - Does a PRD section's prose now disagree with the code?
 *   - Is there a codemap link that should be added/removed?
 *
 * PV does not call the LLM itself — same pattern as `pv generate
 * --prompt`, `pv enrich --prompt`, `pv prd check --prompt`. The user
 * pipes the prompt to their agent and reviews the proposed patches
 * before applying them via `pv generate` / `pv promote` / `pv add-file`
 * / `pv link`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Graph, CodeMap } from '../types';
import {
  AnalyzeResult, DiffEntry, Finding,
  analyzeDiff, getDiffText
} from './changed';
import { fail } from '../output';

export interface ReviewOpts {
  /**
   * --prompt is currently the only mode. Without it the command prints
   * a usage hint and exits 1, mirroring `pv enrich`.
   */
  prompt?: boolean;
}

export function runReview(baseArg: string | undefined, opts: ReviewOpts = {}): void {
  if (!opts.prompt) {
    fail(
      '`pv review` currently only supports --prompt mode. Pipe the output to your coding agent.',
      { hint: 'Run: pv review [<base>] --prompt' }
    );
  }
  const cwd = process.cwd();
  const result = analyzeDiff(baseArg, cwd);
  const diffText = collectDiffText(result, cwd);
  process.stdout.write(buildReviewPrompt(result, diffText, cwd));
}

// ---------- pure prompt builder ----------

/** Source files in the diff (added or modified) — those whose code
 *  the agent may need to inspect to judge behavior change. */
function modifiedSourcePaths(entries: DiffEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.status === 'A' || e.status === 'M') out.push(e.path);
    else if (e.status === 'R') out.push(e.path);
  }
  return out;
}

function collectDiffText(result: AnalyzeResult, cwd: string): string {
  const paths = modifiedSourcePaths(result.entries);
  if (paths.length === 0) return '';
  return getDiffText(result.base, paths, cwd);
}

interface FileLinkContext {
  file: string;
  status: DiffEntry['status'];
  nodes: Array<{
    id: string;
    title: string;
    description: string;
    tags: string[];
    relations: Array<{ type: string; target: string; target_title: string }>;
    linked_prds: Array<{ path: string; section: string; section_body: string }>;
  }>;
}

export function buildReviewPrompt(
  result: AnalyzeResult,
  diffText: string,
  cwd: string
): string {
  const lines: string[] = [];
  lines.push(`# Intent review: ${result.base}..HEAD`);
  lines.push('');
  lines.push(
    'You are reviewing a code change to determine whether it implies updates to the Intent graph or PRD sections. The Intent graph captures *current architecture*; PRDs capture *intent narrative*. Code can change without intent shifting (refactors, perf), but it can also encode a new behavior or contradict an existing description — that\'s drift, and it\'s what this review catches.'
  );
  lines.push('');
  lines.push('Be conservative. Only propose patches when the code change clearly implies an intent-layer update. Pure refactors with no behavior change should produce zero patches.');
  lines.push('');

  // ---- Findings recap ----
  appendFindingsSection(lines, result.findings);

  // ---- Linked context ----
  appendLinkedContextSection(lines, result, cwd);

  // ---- Diff ----
  appendDiffSection(lines, diffText);

  // ---- Output spec ----
  appendOutputSpec(lines);

  return lines.join('\n');
}

function appendFindingsSection(lines: string[], findings: Finding[]): void {
  lines.push('## Structural findings (from `pv changed`)');
  lines.push('');
  if (findings.length === 0) {
    lines.push('_No structural findings — diff is empty or all changes are out of scope._');
    lines.push('');
    return;
  }
  for (const f of findings) {
    const tag = f.severity === 'info' ? 'ℹ' : f.severity === 'warn' ? '⚠' : '✗';
    lines.push(`- ${tag} **${f.kind}** — ${f.message}`);
  }
  lines.push('');
}

function appendLinkedContextSection(lines: string[], result: AnalyzeResult, cwd: string): void {
  const fileToNodes = new Map<string, string[]>();
  for (const [nodeId, files] of Object.entries(result.codemap)) {
    for (const f of files) {
      const list = fileToNodes.get(f) ?? [];
      list.push(nodeId);
      fileToNodes.set(f, list);
    }
  }

  const contexts: FileLinkContext[] = [];
  for (const e of result.entries) {
    if (e.status === 'D') continue;
    const linked = fileToNodes.get(e.path);
    if (!linked || linked.length === 0) continue;
    contexts.push({
      file: e.path,
      status: e.status,
      nodes: linked.map((id) => buildNodeContext(id, result.graph, result.prdIndex, cwd))
    });
  }

  lines.push('## Linked Intent + PRD context');
  lines.push('');
  if (contexts.length === 0) {
    lines.push('_No changed files are linked to Intent nodes._');
    lines.push('');
    return;
  }
  for (const ctx of contexts) {
    lines.push(`### ${ctx.file} _(${diffStatusLabel(ctx.status)})_`);
    lines.push('');
    for (const node of ctx.nodes) {
      lines.push(`#### Linked to: \`${node.id}\` — ${node.title}`);
      if (node.description) {
        lines.push('');
        lines.push(`> ${oneParagraph(node.description)}`);
      }
      if (node.tags.length > 0) {
        lines.push('');
        lines.push(`tags: ${node.tags.map((t) => `\`${t}\``).join(', ')}`);
      }
      if (node.relations.length > 0) {
        lines.push('');
        lines.push('outgoing:');
        for (const r of node.relations) {
          lines.push(`- ${r.type} → \`${r.target}\` (${r.target_title})`);
        }
      }
      if (node.linked_prds.length > 0) {
        lines.push('');
        lines.push('PRD sections referencing this node:');
        for (const p of node.linked_prds) {
          lines.push(`- **${p.path}** / "${p.section}"`);
          if (p.section_body) {
            lines.push('  ```');
            for (const ln of p.section_body.split('\n')) lines.push(`  ${ln}`);
            lines.push('  ```');
          }
        }
      }
      lines.push('');
    }
  }
}

function buildNodeContext(
  nodeId: string,
  graph: Graph,
  prdIndex: Map<string, Array<{ path: string; section: string }>>,
  cwd: string
): FileLinkContext['nodes'][number] {
  const node = graph.nodes[nodeId];
  const relations = (node?.relations ?? []).map((r) => ({
    type: r.type,
    target: r.target,
    target_title: graph.nodes[r.target]?.title ?? '(missing)'
  }));
  const prdRefs = prdIndex.get(nodeId) ?? [];
  const linked_prds = prdRefs.map((ref) => ({
    path: ref.path,
    section: ref.section,
    section_body: extractSectionBody(ref.path, ref.section, cwd)
  }));
  return {
    id: nodeId,
    title: node?.title ?? '(missing)',
    description: node?.description ?? '',
    tags: node?.tags ?? [],
    relations,
    linked_prds
  };
}

function extractSectionBody(prdPath: string, sectionHeading: string, cwd: string): string {
  const abs = path.isAbsolute(prdPath) ? prdPath : path.join(cwd, prdPath);
  let md: string;
  try {
    md = fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
  const lines = md.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m && m[1] === sectionHeading) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // Strip pv-* directives from the rendered context.
  return lines
    .slice(start, end)
    .filter((ln) => !/<!--\s*pv-(intents|claim|status):/.test(ln))
    .join('\n')
    .trim();
}

function appendDiffSection(lines: string[], diffText: string): void {
  lines.push('## Diff');
  lines.push('');
  if (!diffText.trim()) {
    lines.push('_No source-file changes to show._');
    lines.push('');
    return;
  }
  lines.push('```diff');
  lines.push(diffText);
  lines.push('```');
  lines.push('');
}

function appendOutputSpec(lines: string[]): void {
  lines.push('---');
  lines.push('');
  lines.push('## Output format');
  lines.push('');
  lines.push('Return a single JSON object with this shape. Empty `patches` is fine — *no patches* is the right answer for refactors with no behavior change.');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "patches": [');
  lines.push('    {');
  lines.push('      "type": "intent_description_update",');
  lines.push('      "node": "<id>",');
  lines.push('      "current_description": "<excerpt>",');
  lines.push('      "proposed_description": "<full new description>",');
  lines.push('      "reason": "<one-sentence justification tied to a specific diff line>"');
  lines.push('    },');
  lines.push('    {');
  lines.push('      "type": "new_intent_node",');
  lines.push('      "proposed_id": "<TYPE>-<DOMAIN>-<SLUG>",');
  lines.push('      "proposed_type": "requirement|api|workflow|entity",');
  lines.push('      "proposed_domain": "<DOMAIN>",');
  lines.push('      "proposed_title": "...",');
  lines.push('      "proposed_description": "...",');
  lines.push('      "reason": "..."');
  lines.push('    },');
  lines.push('    {');
  lines.push('      "type": "prd_section_update",');
  lines.push('      "prd_path": "...",');
  lines.push('      "section": "<H2 heading>",');
  lines.push('      "issue": "<what now contradicts the code>",');
  lines.push('      "proposed_action": "<what to change>"');
  lines.push('    },');
  lines.push('    {');
  lines.push('      "type": "codemap_link",');
  lines.push('      "node": "<id>",');
  lines.push('      "file": "<path>",');
  lines.push('      "operation": "add|remove",');
  lines.push('      "reason": "..."');
  lines.push('    }');
  lines.push('  ],');
  lines.push('  "summary": "<one paragraph: what this PR is doing in intent terms, and what (if anything) the intent layer needs>"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Do not propose patches that are stylistic, defensive, or out of scope. If unsure, prefer `summary` text over a speculative patch.');
  lines.push('');
}

function diffStatusLabel(s: DiffEntry['status']): string {
  return s === 'A' ? 'added' : s === 'M' ? 'modified' : s === 'D' ? 'removed' : 'renamed';
}

function oneParagraph(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
