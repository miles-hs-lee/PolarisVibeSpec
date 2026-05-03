import * as fs from 'fs';
import * as path from 'path';
import { loadCodeMap, loadGraph } from '../graph/store';
import { toPosix } from '../util/paths';
import { emit } from '../output';

export interface HealthOpts {
  pretty?: boolean;
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ROOTS = ['src', 'lib', 'packages', 'app'];

function listAllSourceFiles(cwd: string): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    const abs = path.join(cwd, root);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    walk(abs, cwd, out);
  }
  return out;
}

function walk(dir: string, cwd: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, cwd, out);
    else if (ent.isFile() && SOURCE_EXT.has(path.extname(ent.name))) {
      out.push(toPosix(path.relative(cwd, full)));
    }
  }
}

/**
 * Graph health metrics. Answer "how well-maintained is my graph?" with
 * a few numbers and a tiny issue list. Distinct from `pv stats` (which
 * reports usage from .polaris/usage.jsonl) — this looks at the graph
 * itself, not at how an agent has been using it.
 */
export function runHealth(opts: HealthOpts = {}): void {
  const cwd = process.cwd();
  const graph = loadGraph(cwd);
  const codeMap = loadCodeMap(cwd);

  const totalNodes = Object.keys(graph.nodes).length;
  const totalEdges = Object.values(graph.nodes).reduce(
    (s, n) => s + n.relations.length,
    0
  );
  const codemapEntries = Object.keys(codeMap).length;

  const codemappedFiles = new Set<string>();
  for (const files of Object.values(codeMap)) {
    for (const f of files) codemappedFiles.add(f);
  }

  const allSourceFiles = listAllSourceFiles(cwd);
  const orphans = allSourceFiles.filter((f) => !codemappedFiles.has(f));
  const codemapCoverage =
    allSourceFiles.length > 0
      ? (allSourceFiles.length - orphans.length) / allSourceFiles.length
      : null;

  // Degree counts.
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const node of Object.values(graph.nodes)) {
    outDegree.set(node.id, node.relations.length);
    for (const r of node.relations) {
      inDegree.set(r.target, (inDegree.get(r.target) || 0) + 1);
    }
  }

  const isolated: string[] = [];
  for (const id of Object.keys(graph.nodes)) {
    if ((inDegree.get(id) || 0) === 0 && (outDegree.get(id) || 0) === 0) {
      isolated.push(id);
    }
  }

  const domains = new Set<string>();
  for (const n of Object.values(graph.nodes)) domains.add(n.domain);

  const density =
    totalNodes > 1 ? totalEdges / (totalNodes * (totalNodes - 1)) : 0;

  // Build a small ranked issue list. Severity reflects priority for
  // graph maintainers; nothing is fatal.
  const issues: Array<{ level: 'info' | 'warn' | 'high'; message: string }> = [];
  if (codemapCoverage !== null && codemapCoverage < 0.5) {
    issues.push({
      level: 'high',
      message: `Codemap coverage low: ${(codemapCoverage * 100).toFixed(0)}% (${orphans.length} orphan source files). Add codemap entries with \`pv add-file\`.`
    });
  } else if (codemapCoverage !== null && codemapCoverage < 0.8) {
    issues.push({
      level: 'warn',
      message: `Codemap coverage moderate: ${(codemapCoverage * 100).toFixed(0)}% (${orphans.length} orphan source files).`
    });
  }
  if (isolated.length > 0) {
    issues.push({
      level: 'warn',
      message: `${isolated.length} isolated node(s) (no incoming or outgoing relations): ${isolated.slice(0, 5).join(', ')}${isolated.length > 5 ? ', …' : ''}.`
    });
  }
  if (totalNodes > 0 && codemapEntries / totalNodes < 0.5) {
    issues.push({
      level: 'warn',
      message: `Only ${codemapEntries}/${totalNodes} nodes have codemap entries. APIs and entities should generally be mapped.`
    });
  }

  emit(
    {
      ok: true,
      summary: {
        total_nodes: totalNodes,
        total_edges: totalEdges,
        codemap_entries: codemapEntries,
        total_source_files: allSourceFiles.length,
        codemapped_source_files: allSourceFiles.length - orphans.length,
        orphan_source_files: orphans.length,
        isolated_nodes: isolated.length,
        domains: domains.size,
        avg_out_degree: totalNodes > 0 ? totalEdges / totalNodes : 0,
        graph_density: round4(density),
        codemap_coverage: codemapCoverage !== null ? round4(codemapCoverage) : null
      },
      issues,
      isolated_nodes_list: isolated.slice(0, 10),
      orphan_files_list: orphans.slice(0, 20)
    },
    { pretty: opts.pretty }
  );
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
