import * as fs from 'fs';
import * as path from 'path';
import { CodeMap, Graph, SpecNode } from '../types';
import { loadCodeMap, saveCodeMap } from '../graph/store';

export interface ResolveResult {
  explicit: string[];
  inferred: string[];
  warnings: string[];
}

/**
 * Resolve files for a single node.
 * Explicit codemap entries take priority; otherwise we fall back to a
 * tag/domain → folder heuristic. The two are returned separately so callers
 * can distinguish "ground truth" from "best guess".
 */
export function resolveNodeFiles(
  node: SpecNode,
  codeMap: CodeMap,
  cwd: string = process.cwd()
): ResolveResult {
  const warnings: string[] = [];
  const explicit = (codeMap[node.id] ?? []).slice();

  // Validate explicit paths. Missing files don't drop from the list — Codex
  // may need to create them — but we do warn.
  for (const p of explicit) {
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
    if (!fs.existsSync(abs)) {
      warnings.push(`Missing file in codemap: ${node.id} -> ${p}`);
    }
  }

  if (explicit.length > 0) {
    return { explicit, inferred: [], warnings };
  }

  // Heuristic fallback: src/<domain-lower>/** if that directory exists.
  const inferred = inferFromTagsOrDomain(node, cwd);
  return { explicit: [], inferred, warnings };
}

function inferFromTagsOrDomain(node: SpecNode, cwd: string): string[] {
  const candidates = new Set<string>();
  const probes = new Set<string>();
  if (node.domain) probes.add(node.domain.toLowerCase());
  for (const tag of node.tags) probes.add(tag.toLowerCase());

  for (const probe of probes) {
    if (!probe) continue;
    const dir = path.join('src', probe);
    const abs = path.join(cwd, dir);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      candidates.add(`${dir}/**`);
    }
  }
  return Array.from(candidates);
}

export function resolveFilesForNodes(
  graph: Graph,
  nodeIds: string[],
  codeMap: CodeMap,
  cwd: string = process.cwd()
): { explicit: string[]; inferred: string[]; warnings: string[] } {
  const explicit = new Set<string>();
  const inferred = new Set<string>();
  const warnings: string[] = [];

  for (const id of nodeIds) {
    const node = graph.nodes[id];
    if (!node) continue;
    const r = resolveNodeFiles(node, codeMap, cwd);
    r.explicit.forEach((p) => explicit.add(p));
    r.inferred.forEach((p) => inferred.add(p));
    warnings.push(...r.warnings);
  }

  return {
    explicit: Array.from(explicit).sort(),
    inferred: Array.from(inferred).sort(),
    warnings
  };
}

export function addFile(nodeId: string, filePath: string, cwd?: string): CodeMap {
  const map = loadCodeMap(cwd);
  const list = map[nodeId] ?? [];
  if (!list.includes(filePath)) list.push(filePath);
  list.sort();
  map[nodeId] = list;
  saveCodeMap(map, cwd);
  return map;
}

export function removeFile(nodeId: string, filePath: string, cwd?: string): CodeMap {
  const map = loadCodeMap(cwd);
  const list = (map[nodeId] ?? []).filter((p) => p !== filePath);
  if (list.length === 0) {
    delete map[nodeId];
  } else {
    map[nodeId] = list;
  }
  saveCodeMap(map, cwd);
  return map;
}
