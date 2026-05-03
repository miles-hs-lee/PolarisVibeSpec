import { NodeType, Counters, Graph } from './types';
import { loadCounters, saveCounters, loadGraph } from './graph/store';

const TYPE_PREFIX: Record<NodeType, string> = {
  requirement: 'REQ',
  api: 'API',
  workflow: 'WF',
  entity: 'ENT'
};

export function typePrefix(type: NodeType): string {
  return TYPE_PREFIX[type];
}

export function slugify(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function nextCounter(counters: Counters, key: string): number {
  const n = (counters[key] ?? 0) + 1;
  counters[key] = n;
  return n;
}

export interface MintInput {
  type: NodeType;
  domain: string;
  title: string;
  hint?: string;
}

/**
 * Reconcile counter state with the actual graph. Counters are a cache of
 * "highest used number per (prefix,domain)" and "id taken" flags; if the
 * graph was hand-edited, adopted from another repo, or counters.json was
 * lost, the cache lags behind. This brings it forward so a fresh `mintId`
 * never collides with an existing graph node.
 */
function syncCountersWithGraph(counters: Counters, graph: Graph): void {
  for (const id of Object.keys(graph.nodes)) {
    // Bump per-(prefix,domain) numeric counter (REQ-AUTH-007 → REQ-AUTH ≥ 7).
    const m = id.match(/^([A-Z]+)-([A-Z0-9]+)-(\d{3,})$/);
    if (m) {
      const key = `${m[1]}-${m[2]}`;
      const n = parseInt(m[3], 10);
      if (!Number.isNaN(n) && (counters[key] ?? 0) < n) {
        counters[key] = n;
      }
    }
    // Flag the id itself so non-requirement (slug-based) mints disambiguate.
    if ((counters[`__collision__${id}`] ?? 0) === 0) {
      counters[`__collision__${id}`] = 1;
    }
  }
}

export function mintId(input: MintInput, cwd?: string): string {
  const { type, domain, title, hint } = input;
  const prefix = typePrefix(type);
  const dom = slugify(domain) || 'GENERAL';

  const counters = loadCounters(cwd);
  // Always reconcile with the graph before minting so adopted/seeded
  // graphs (no counters.json) and hand-edited graph.json don't produce
  // colliding ids on the next `pv generate`.
  const graph = loadGraph(cwd);
  syncCountersWithGraph(counters, graph);

  let id: string;
  if (type === 'requirement') {
    const key = `${prefix}-${dom}`;
    const n = nextCounter(counters, key);
    id = `${prefix}-${dom}-${String(n).padStart(3, '0')}`;
  } else {
    const slugSource = hint && hint.length > 0 ? hint : title;
    const slug = slugify(slugSource) || String(nextCounter(counters, `${prefix}-${dom}-FALLBACK`)).padStart(3, '0');
    id = `${prefix}-${dom}-${slug}`;
    // Disambiguate collisions deterministically.
    const collisionKey = id;
    const collisions = counters[`__collision__${collisionKey}`] ?? 0;
    if (collisions > 0) {
      id = `${id}-${String(collisions + 1).padStart(2, '0')}`;
    }
    counters[`__collision__${collisionKey}`] = collisions + 1;
  }

  saveCounters(counters, cwd);
  return id;
}

