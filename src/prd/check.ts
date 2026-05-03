/**
 * Validate a parsed PRD against the Intent graph.
 *
 * Pure function — no IO. Takes a ParsedPrd plus a Graph, returns a
 * structured CheckResult. Layer 1 of the three-layer check model
 * documented in docs/PRD-DESIGN.md.
 */

import { Graph, SpecNode } from '../types';
import { ParsedPrd, PrdReference, STRICT_ID } from './parse';

export type RefStatus = 'ok' | 'dangling' | 'malformed';

export interface CheckedReference extends PrdReference {
  status: RefStatus;
}

export type WarningType = 'orphan_prd' | 'unmatched_api_path' | 'parse';

export interface CheckWarning {
  type: WarningType;
  message: string;
  line?: number;
}

export interface CheckResult {
  path: string;
  ok: boolean;
  references: CheckedReference[];
  warnings: CheckWarning[];
}

export function checkPrd(parsed: ParsedPrd, graph: Graph): CheckResult {
  const result: CheckResult = {
    path: parsed.path,
    ok: true,
    references: [],
    warnings: []
  };

  for (const ref of parsed.references) {
    if (!STRICT_ID.test(ref.id)) {
      result.references.push({ ...ref, status: 'malformed' });
      result.ok = false;
      continue;
    }
    const exists = !!graph.nodes[ref.id];
    result.references.push({ ...ref, status: exists ? 'ok' : 'dangling' });
    if (!exists) result.ok = false;
  }

  if (parsed.references.length === 0) {
    result.warnings.push({
      type: 'orphan_prd',
      message:
        'PRD has no Intent references — link via frontmatter `intents:` or mention IDs in body'
    });
  }

  for (const mention of parsed.apiPathMentions) {
    if (!findMatchingApiNode(graph, mention.verb, mention.path)) {
      result.warnings.push({
        type: 'unmatched_api_path',
        message: `"${mention.verb} ${mention.path}" mentioned but no matching API node found`,
        line: mention.line
      });
    }
  }

  for (const w of parsed.parseWarnings) {
    result.warnings.push({ type: 'parse', message: w });
  }

  return result;
}

function findMatchingApiNode(graph: Graph, verb: string, path: string): SpecNode | null {
  const target = `${verb} ${path}`.toUpperCase();
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== 'api') continue;
    if (node.title.toUpperCase().includes(target)) return node;
  }
  return null;
}

export interface OrphanIntents {
  intents: string[];
}

/**
 * In `--strict` mode, identify Intent nodes that no checked PRD
 * references. Most teams should leave this off — many Intents
 * (infrastructural entities, bug-fix REQs) legitimately have no
 * product PRD origin.
 */
export function findOrphanIntents(results: CheckResult[], graph: Graph): OrphanIntents {
  const referenced = new Set<string>();
  for (const r of results) {
    for (const ref of r.references) {
      if (ref.status === 'ok') referenced.add(ref.id);
    }
  }
  return {
    intents: Object.keys(graph.nodes).filter((id) => !referenced.has(id))
  };
}
