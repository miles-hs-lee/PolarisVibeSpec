/**
 * `pv changed [<base>]` — the new headline command.
 *
 * Reads `git diff base..HEAD`, joins it against the Intent graph and
 * codemap and PRD links, and reports drift findings:
 *
 *   - orphan_added     : new source file not in any codemap entry
 *   - broken_codemap   : codemap still references a removed file
 *   - rename_codemap   : file was renamed but codemap kept the old path
 *   - linked_node      : modified file is linked to one or more Intents
 *                        (informational; agent should consider whether
 *                        the linked PRD sections need updates)
 *
 * Exit code 0 when only `info` findings (or none); 1 when any
 * `warn`/`error` finding appears, so CI can gate PRs on intent drift.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { CodeMap, Graph } from '../types';
import { loadCodeMap, loadGraph } from '../graph/store';
import { discoverPrds } from '../prd/discover';
import { parsePrd } from '../prd/parse';
import { toPosix } from '../util/paths';
import { emit, fail } from '../output';

export interface ChangedOpts {
  pretty?: boolean;
}

type Severity = 'error' | 'warn' | 'info';

export type FindingKind =
  | 'orphan_added'
  | 'broken_codemap'
  | 'rename_codemap'
  | 'linked_node';

export interface Finding {
  severity: Severity;
  kind: FindingKind;
  file?: string;
  file_old?: string;
  file_new?: string;
  node?: string;
  node_title?: string;
  linked_prds?: Array<{ path: string; section: string }>;
  message: string;
  suggested_action?: string;
}

export interface DiffEntry {
  status: 'A' | 'M' | 'D' | 'R';
  path: string;
  /** for renames, the old path */
  old_path?: string;
}

export interface ChangedReport {
  ok: boolean;
  base: string;
  diff: {
    files_added: string[];
    files_modified: string[];
    files_removed: string[];
    files_renamed: Array<{ old: string; new: string }>;
  };
  findings: Finding[];
  summary: {
    files_in_diff: number;
    linked_nodes_touched: number;
    linked_prds_touched: number;
    orphan_added: number;
    broken_codemap: number;
  };
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Paths PV does not subject to intent-traceability checks. These are
// PV-managed artifacts (.polaris, spec, generated PRDs), build outputs
// (dist, node_modules), or developer infrastructure that doesn't model
// product behavior (tests, experiments, scripts, examples). `pv validate`
// uses an analogous "scan roots = src/" rule by default; this is the
// inverse: anything outside `src/`-style roots is out of scope here.
const IGNORE_PREFIXES = [
  '.polaris/',
  'spec/',
  'docs/prd/',
  'node_modules/',
  'dist/',
  '.git/',
  'test/',
  'tests/',
  '__tests__/',
  'experiments/',
  'scripts/',
  'examples/'
];

function isSourceFile(p: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(p));
}

function isIgnored(p: string): boolean {
  return IGNORE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

// ---------- git plumbing ----------

function detectBase(cwd: string): string {
  for (const candidate of ['origin/main', 'main', 'HEAD~1']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', candidate], {
        cwd, stdio: ['ignore', 'pipe', 'ignore']
      });
      return candidate;
    } catch {
      // try next
    }
  }
  fail(
    'Could not auto-detect a base ref. Pass one explicitly: `pv changed <ref>`.',
    { tried: ['origin/main', 'main', 'HEAD~1'] }
  );
}

export function parseGitDiff(raw: string): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (status.startsWith('A')) out.push({ status: 'A', path: parts[1] });
    else if (status.startsWith('M')) out.push({ status: 'M', path: parts[1] });
    else if (status.startsWith('D')) out.push({ status: 'D', path: parts[1] });
    else if (status.startsWith('R')) {
      // R<score>\told\tnew
      out.push({ status: 'R', old_path: parts[1], path: parts[2] });
    }
    // ignore other statuses (T type-change, U unmerged, etc.) for v1
  }
  return out;
}

function gitDiff(base: string, cwd: string): DiffEntry[] {
  let raw: string;
  try {
    raw = execFileSync(
      'git',
      ['diff', '--name-status', '--find-renames', `${base}...HEAD`],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
    ).toString();
  } catch (err) {
    fail(`Could not run \`git diff ${base}...HEAD\`. Is this a git repo?`, {
      err: (err as Error).message
    });
  }
  return parseGitDiff(raw);
}

// ---------- index builders ----------

/** Reverse codemap: filepath → list of node ids that claim it. */
export function buildFileToNodes(codemap: CodeMap): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [nodeId, files] of Object.entries(codemap)) {
    for (const f of files) {
      const list = out.get(f) ?? [];
      list.push(nodeId);
      out.set(f, list);
    }
  }
  return out;
}

/** Index from intent id → list of {prd path, section heading} pairs. */
export function buildNodeToPrdSections(
  prdPaths: string[],
  cwd: string
): Map<string, Array<{ path: string; section: string }>> {
  const out = new Map<string, Array<{ path: string; section: string }>>();
  for (const prdPath of prdPaths) {
    let parsed;
    try {
      const md = fs.readFileSync(prdPath, 'utf8');
      parsed = parsePrd(md, path.relative(cwd, prdPath));
    } catch {
      continue; // skip unreadable PRDs
    }
    for (const section of parsed.sections) {
      for (const intentId of section.intents) {
        const list = out.get(intentId) ?? [];
        list.push({ path: parsed.path, section: section.heading });
        out.set(intentId, list);
      }
    }
  }
  return out;
}

// ---------- finding generators ----------

export function generateFindings(
  entries: DiffEntry[],
  graph: Graph,
  codemap: CodeMap,
  prdIndex: Map<string, Array<{ path: string; section: string }>>
): Finding[] {
  const findings: Finding[] = [];
  const fileToNodes = buildFileToNodes(codemap);

  for (const entry of entries) {
    const p = toPosix(entry.path);
    if (isIgnored(p)) continue;

    if (entry.status === 'A') {
      if (!isSourceFile(p)) continue;
      const linked = fileToNodes.get(p);
      if (!linked || linked.length === 0) {
        findings.push({
          severity: 'warn',
          kind: 'orphan_added',
          file: p,
          message: `${p} is new but not linked in any codemap entry.`,
          suggested_action: `pv add-file <node-id> ${p}`
        });
      } else {
        emitLinkedNode(findings, p, linked, graph, prdIndex);
      }
    } else if (entry.status === 'M') {
      const linked = fileToNodes.get(p);
      if (linked && linked.length > 0) {
        emitLinkedNode(findings, p, linked, graph, prdIndex);
      }
      // Modified-but-orphan files are *not* flagged: they were already
      // orphan, the modification doesn't worsen drift. `pv validate`
      // already flags orphan_source on them.
    } else if (entry.status === 'D') {
      // Removed file. If codemap still references it, flag as broken.
      const linked = fileToNodes.get(p);
      if (linked && linked.length > 0) {
        for (const nodeId of linked) {
          findings.push({
            severity: 'error',
            kind: 'broken_codemap',
            file: p,
            node: nodeId,
            node_title: graph.nodes[nodeId]?.title,
            message: `${p} was removed but still listed in codemap of ${nodeId}.`,
            suggested_action: `pv rm-file ${nodeId} ${p}`
          });
        }
      }
    } else if (entry.status === 'R') {
      const oldP = toPosix(entry.old_path!);
      const newP = p;
      if (isIgnored(oldP)) continue;

      const oldLinked = fileToNodes.get(oldP);
      const newLinked = fileToNodes.get(newP);
      if (oldLinked && oldLinked.length > 0 && (!newLinked || newLinked.length === 0)) {
        // Codemap kept the old path; rename didn't propagate.
        for (const nodeId of oldLinked) {
          findings.push({
            severity: 'error',
            kind: 'rename_codemap',
            file_old: oldP,
            file_new: newP,
            node: nodeId,
            node_title: graph.nodes[nodeId]?.title,
            message: `${oldP} → ${newP} renamed, but codemap of ${nodeId} still points at the old path.`,
            suggested_action: `pv rm-file ${nodeId} ${oldP} && pv add-file ${nodeId} ${newP}`
          });
        }
      } else if (newLinked && newLinked.length > 0) {
        // Rename was followed; treat as a normal modification.
        emitLinkedNode(findings, newP, newLinked, graph, prdIndex);
      } else if (isSourceFile(newP) && (!newLinked || newLinked.length === 0)) {
        findings.push({
          severity: 'warn',
          kind: 'orphan_added',
          file: newP,
          message: `${newP} (renamed from ${oldP}) is not linked in any codemap entry.`,
          suggested_action: `pv add-file <node-id> ${newP}`
        });
      }
    }
  }

  return findings;
}

function emitLinkedNode(
  findings: Finding[],
  file: string,
  nodeIds: string[],
  graph: Graph,
  prdIndex: Map<string, Array<{ path: string; section: string }>>
): void {
  for (const nodeId of nodeIds) {
    const node = graph.nodes[nodeId];
    const linkedPrds = prdIndex.get(nodeId) ?? [];
    findings.push({
      severity: 'info',
      kind: 'linked_node',
      file,
      node: nodeId,
      node_title: node?.title,
      linked_prds: linkedPrds.length > 0 ? linkedPrds : undefined,
      message:
        linkedPrds.length > 0
          ? `${file} is linked to ${nodeId} (${linkedPrds.length} PRD section${linkedPrds.length === 1 ? '' : 's'} reference it; review whether they need updates).`
          : `${file} is linked to ${nodeId}.`
    });
  }
}

// ---------- command entry ----------

export function runChanged(baseArg: string | undefined, opts: ChangedOpts = {}): void {
  const cwd = process.cwd();
  const base = baseArg ?? detectBase(cwd);
  const entries = gitDiff(base, cwd);
  const graph = loadGraph(cwd);
  const codemap = loadCodeMap(cwd);
  const prdIndex = buildNodeToPrdSections(discoverPrds(cwd), cwd);

  const findings = generateFindings(entries, graph, codemap, prdIndex);

  // Collate the diff sections.
  const filesAdded: string[] = [];
  const filesModified: string[] = [];
  const filesRemoved: string[] = [];
  const filesRenamed: Array<{ old: string; new: string }> = [];
  for (const e of entries) {
    if (e.status === 'A') filesAdded.push(e.path);
    else if (e.status === 'M') filesModified.push(e.path);
    else if (e.status === 'D') filesRemoved.push(e.path);
    else if (e.status === 'R') filesRenamed.push({ old: e.old_path!, new: e.path });
  }

  const linkedNodes = new Set<string>();
  const linkedPrds = new Set<string>();
  let orphanAdded = 0;
  let brokenCodemap = 0;
  for (const f of findings) {
    if (f.kind === 'linked_node' && f.node) linkedNodes.add(f.node);
    if (f.linked_prds) for (const p of f.linked_prds) linkedPrds.add(p.path);
    if (f.kind === 'orphan_added') orphanAdded++;
    if (f.kind === 'broken_codemap' || f.kind === 'rename_codemap') brokenCodemap++;
  }

  const hasBlocking = findings.some(
    (f) => f.severity === 'warn' || f.severity === 'error'
  );

  const report: ChangedReport = {
    ok: !hasBlocking,
    base,
    diff: {
      files_added: filesAdded,
      files_modified: filesModified,
      files_removed: filesRemoved,
      files_renamed: filesRenamed
    },
    findings,
    summary: {
      files_in_diff:
        filesAdded.length + filesModified.length + filesRemoved.length + filesRenamed.length,
      linked_nodes_touched: linkedNodes.size,
      linked_prds_touched: linkedPrds.size,
      orphan_added: orphanAdded,
      broken_codemap: brokenCodemap
    }
  };

  emit(report, { pretty: opts.pretty });
  if (hasBlocking) process.exit(1);
}
