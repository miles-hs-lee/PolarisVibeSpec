import * as fs from 'fs';
import * as path from 'path';
import { Graph, SpecNode } from '../types';
import { loadGraph, saveGraph } from '../graph/store';
import { parseSpec, ParsedSpec } from '../compiler/markdownParser';
import { graphToMarkdown } from '../compiler/graphToMarkdown';
import { emit, fail } from '../output';

export interface PromoteOpts {
  pretty?: boolean;
  /** Don't save graph; just report what would happen. */
  dryRun?: boolean;
  /** Override default spec dir (./spec). */
  specDir?: string;
}

interface PromoteReport {
  promoted: Array<{ id: string; fields: string[] }>;
  rejected: Array<{ id: string; reasons: string[] }>;
  unchanged: string[];
}

const DO_NOT_EDIT_HEADER =
  '<!-- DO NOT EDIT — regenerate via `pv export-all`. Source: .polaris/graph.json -->\n\n';

function expectedMarkdown(node: SpecNode, graph: Graph): string {
  return DO_NOT_EDIT_HEADER + graphToMarkdown(node, graph, { linkTargets: true });
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface CompareResult {
  applied: string[];
  rejected: string[];
}

function compareAndApply(node: SpecNode, parsed: ParsedSpec): CompareResult {
  const applied: string[] = [];
  const rejected: string[] = [];

  // ---- Structural (cannot change via markdown) ----
  if (parsed.id && parsed.id !== node.id) {
    rejected.push(
      `H1 id "${parsed.id}" doesn't match node "${node.id}" — id changes break references; edit graph.json directly`
    );
  }
  if (parsed.type && parsed.type !== node.type) {
    rejected.push(
      `Type changed (markdown: "${parsed.type}", graph: "${node.type}") — type changes are structural, not allowed via markdown`
    );
  }
  if (parsed.domain && parsed.domain !== node.domain) {
    rejected.push(
      `Domain changed (markdown: "${parsed.domain}", graph: "${node.domain}") — domain is part of the id; not editable via markdown`
    );
  }
  if (parsed.createdAt && parsed.createdAt !== node.createdAt) {
    rejected.push(`createdAt changed — this field is immutable`);
  }

  // Outgoing relations: compare as set of "type::target".
  const expectedRels = new Set(node.relations.map((r) => `${r.type}::${r.target}`));
  const actualRels = new Set(parsed.outgoing.map((r) => `${r.type}::${r.target}`));
  const added = [...actualRels].filter((x) => !expectedRels.has(x));
  const removed = [...expectedRels].filter((x) => !actualRels.has(x));
  if (added.length > 0 || removed.length > 0) {
    const parts: string[] = [];
    if (added.length > 0) parts.push(`added [${added.join(', ')}]`);
    if (removed.length > 0) parts.push(`removed [${removed.join(', ')}]`);
    rejected.push(
      `Outgoing relations changed (${parts.join('; ')}) — use \`pv link\` to add edges or edit graph.json directly`
    );
  }

  if (rejected.length > 0) return { applied, rejected };

  // ---- Editable (apply) ----
  if (parsed.title !== null && parsed.title !== node.title) {
    node.title = parsed.title;
    applied.push('title');
  }
  if (parsed.tags !== null && !arraysEqual(parsed.tags, node.tags)) {
    node.tags = parsed.tags;
    applied.push('tags');
  }
  if (parsed.description && parsed.description !== node.description) {
    node.description = parsed.description;
    applied.push('description');
  }

  return { applied, rejected };
}

export function runPromote(opts: PromoteOpts = {}): void {
  const cwd = process.cwd();
  const specDirPath = opts.specDir
    ? path.resolve(cwd, opts.specDir)
    : path.join(cwd, 'spec');

  if (!fs.existsSync(specDirPath)) {
    fail(`spec/ not found at ${path.relative(cwd, specDirPath)}. Run \`pv export-all\` first.`);
  }

  const graph = loadGraph(cwd);
  const report: PromoteReport = { promoted: [], rejected: [], unchanged: [] };

  const seen = new Set<string>();
  for (const file of fs.readdirSync(specDirPath)) {
    if (!file.endsWith('.md')) continue;
    if (file === 'README.md') continue;
    const id = file.replace(/\.md$/, '');
    seen.add(id);

    const filePath = path.join(specDirPath, file);
    const actualMd = fs.readFileSync(filePath, 'utf8');

    const node = graph.nodes[id];
    if (!node) {
      report.rejected.push({
        id,
        reasons: [
          `no graph node with this id (orphan markdown — delete spec/${file} or add the node first)`
        ]
      });
      continue;
    }

    // Quick path: file matches expected output exactly.
    const expected = expectedMarkdown(node, graph);
    if (actualMd === expected) {
      report.unchanged.push(id);
      continue;
    }

    const parsed = parseSpec(actualMd);
    if (parsed.errors.length > 0) {
      report.rejected.push({ id, reasons: parsed.errors });
      continue;
    }

    const cmp = compareAndApply(node, parsed);
    if (cmp.rejected.length > 0) {
      report.rejected.push({ id, reasons: cmp.rejected });
      continue;
    }
    if (cmp.applied.length === 0) {
      // Diff was non-structural and non-editable (e.g. user reformatted
      // whitespace, changed incoming-relation display titles). Treat as
      // unchanged from the graph's perspective; export-all will normalize.
      report.unchanged.push(id);
      continue;
    }
    report.promoted.push({ id, fields: cmp.applied });
  }

  if (!opts.dryRun && report.promoted.length > 0) {
    saveGraph(graph, cwd);
  }

  const allOk = report.rejected.length === 0;
  emit(
    {
      ok: allOk,
      summary: {
        promoted: report.promoted.length,
        rejected: report.rejected.length,
        unchanged: report.unchanged.length,
        dry_run: !!opts.dryRun
      },
      promoted: report.promoted,
      rejected: report.rejected,
      unchanged: report.unchanged,
      next_steps: allOk
        ? [
            opts.dryRun
              ? 'Re-run without --dry-run to apply.'
              : 'Run `pv export-all` to refresh spec/ to a canonical state.'
          ]
        : [
            'Resolve the rejection reasons above:',
            '  • Structural changes (id / type / domain / relations) require `pv link` or a graph.json edit.',
            '  • Then re-run `pv promote`.'
          ]
    },
    { pretty: opts.pretty }
  );

  if (!allOk) process.exit(1);
}
