import * as fs from 'fs';
import * as path from 'path';
import { Graph, CodeMap, Counters } from '../types';
import {
  loadGraph, saveGraph,
  loadCodeMap, saveCodeMap,
  loadCounters, saveCounters
} from '../graph/store';
import { discoverPrds } from '../prd/discover';
import { emit, fail } from '../output';

export interface RenameOpts {
  pretty?: boolean;
  dryRun?: boolean;
}

interface PrdChange {
  path: string;
  occurrences: number;
}

interface RenameReport {
  ok: true;
  old: string;
  new: string;
  dry_run: boolean;
  changes: {
    graph: { node_renamed: boolean; relations_updated: number };
    codemap: { entry_renamed: boolean; files: string[] };
    counters: { collision_flag_renamed: boolean; numeric_counter_bumped: boolean };
    prds: PrdChange[];
  };
  next_steps: string[];
}

const STRICT_ID = /^(REQ|API|WF|ENT)-[A-Z0-9]+-[A-Z0-9_-]+$/;

export function runRename(oldId: string, newId: string, opts: RenameOpts = {}): void {
  if (oldId === newId) {
    fail(`old and new ids are identical: ${oldId}`);
  }
  if (!STRICT_ID.test(oldId)) {
    fail(`malformed old id: ${oldId} (expected <TYPE>-<DOMAIN>-<SLUG>)`);
  }
  if (!STRICT_ID.test(newId)) {
    fail(`malformed new id: ${newId} (expected <TYPE>-<DOMAIN>-<SLUG>)`);
  }
  const oldType = oldId.split('-')[0];
  const newType = newId.split('-')[0];
  if (oldType !== newType) {
    fail(
      `type change not allowed: ${oldId} (${oldType}) → ${newId} (${newType}). ` +
      `Renaming preserves the conceptual category. Delete and re-create if you really mean to change type.`
    );
  }

  const cwd = process.cwd();
  const graph = loadGraph(cwd);
  const codemap = loadCodeMap(cwd);
  const counters = loadCounters(cwd);

  if (!graph.nodes[oldId]) {
    fail(`node not found: ${oldId}`);
  }
  if (graph.nodes[newId]) {
    fail(`new id already exists: ${newId}`);
  }

  // ---- Plan all changes (no IO yet) ----
  const updatedGraph = renameInGraph(graph, oldId, newId);
  const updatedCodemap = renameInCodemap(codemap, oldId, newId);
  const { counters: updatedCounters, collisionFlagMoved, numericBumped } =
    renameInCounters(counters, oldId, newId);

  const prdChanges: PrdChange[] = [];
  const prdRewrites: Array<{ path: string; content: string }> = [];
  for (const prdPath of discoverPrds(cwd)) {
    const original = fs.readFileSync(prdPath, 'utf8');
    const { content, occurrences } = replaceIdInPrd(original, oldId, newId);
    if (occurrences > 0) {
      prdChanges.push({ path: path.relative(cwd, prdPath), occurrences });
      prdRewrites.push({ path: prdPath, content });
    }
  }

  // ---- Apply (or skip in dry-run) ----
  if (!opts.dryRun) {
    saveGraph(updatedGraph, cwd);
    saveCodeMap(updatedCodemap, cwd);
    saveCounters(updatedCounters, cwd);
    for (const r of prdRewrites) {
      fs.writeFileSync(r.path, r.content, 'utf8');
    }
  }

  const relationsUpdated = countRelationTargets(graph, oldId);
  const codemapFiles = codemap[oldId] ?? [];

  const report: RenameReport = {
    ok: true,
    old: oldId,
    new: newId,
    dry_run: !!opts.dryRun,
    changes: {
      graph: { node_renamed: true, relations_updated: relationsUpdated },
      codemap: { entry_renamed: codemapFiles.length > 0, files: codemapFiles },
      counters: {
        collision_flag_renamed: collisionFlagMoved,
        numeric_counter_bumped: numericBumped
      },
      prds: prdChanges
    },
    next_steps: opts.dryRun
      ? ['Re-run without --dry-run to apply.']
      : [
          'Run `pv export-all` to regenerate spec/.',
          'Run `pv validate` to confirm graph integrity.',
          ...(prdChanges.length > 0 ? ['Run `pv prd check` to confirm PRD references.'] : [])
        ]
  };

  emit(report, { pretty: opts.pretty });
}

// ---------- pure helpers ----------

export function renameInGraph(graph: Graph, oldId: string, newId: string): Graph {
  const node = graph.nodes[oldId];
  if (!node) return graph;
  const renamedNode = { ...node, id: newId };
  const newNodes: Record<string, typeof node> = {};
  for (const [k, v] of Object.entries(graph.nodes)) {
    if (k === oldId) {
      newNodes[newId] = renamedNode;
    } else {
      // Update any outgoing relation that points at oldId.
      const rewrittenRels = v.relations.map((r) =>
        r.target === oldId ? { ...r, target: newId } : r
      );
      newNodes[k] = { ...v, relations: rewrittenRels };
    }
  }
  return { ...graph, nodes: newNodes };
}

export function renameInCodemap(map: CodeMap, oldId: string, newId: string): CodeMap {
  const out: CodeMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (k === oldId) out[newId] = v;
    else out[k] = v;
  }
  return out;
}

export function renameInCounters(
  counters: Counters,
  oldId: string,
  newId: string
): { counters: Counters; collisionFlagMoved: boolean; numericBumped: boolean } {
  const out: Counters = { ...counters };
  let collisionFlagMoved = false;
  let numericBumped = false;

  // Collision flag rename.
  const oldFlag = `__collision__${oldId}`;
  const newFlag = `__collision__${newId}`;
  if (out[oldFlag] !== undefined) {
    out[newFlag] = out[oldFlag];
    delete out[oldFlag];
    collisionFlagMoved = true;
  }

  // Bump the new id's numeric counter so future mints don't collide.
  // Example: REQ-AUTH-002 → REQ-AUTH-PASSKEY. The "REQ-AUTH" counter
  // doesn't move (slug is non-numeric). But REQ-AUTH-002 → REQ-AUTH-007
  // requires bumping "REQ-AUTH" to ≥ 7.
  const newMatch = newId.match(/^([A-Z]+)-([A-Z0-9]+)-(\d{3,})$/);
  if (newMatch) {
    const key = `${newMatch[1]}-${newMatch[2]}`;
    const n = parseInt(newMatch[3], 10);
    if (!Number.isNaN(n) && (out[key] ?? 0) < n) {
      out[key] = n;
      numericBumped = true;
    }
  }

  return { counters: out, collisionFlagMoved, numericBumped };
}

/**
 * Replace whole-word occurrences of `oldId` with `newId` in PRD markdown.
 * Conservative — only replaces standalone IDs, not substrings, to avoid
 * collateral damage on unrelated text. Returns occurrence count for the
 * report.
 */
export function replaceIdInPrd(
  content: string,
  oldId: string,
  newId: string
): { content: string; occurrences: number } {
  // Word boundary on both sides; escape the old id (it can contain `-`
  // which is a metacharacter only inside [..]; here it's safe).
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(oldId)}(?![A-Za-z0-9_-])`, 'g');
  let occurrences = 0;
  const replaced = content.replace(re, () => {
    occurrences++;
    return newId;
  });
  return { content: replaced, occurrences };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countRelationTargets(graph: Graph, id: string): number {
  let n = 0;
  for (const node of Object.values(graph.nodes)) {
    for (const rel of node.relations) {
      if (rel.target === id) n++;
    }
  }
  return n;
}
