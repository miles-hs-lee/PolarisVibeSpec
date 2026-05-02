import { NodeType, Counters } from './types';
import { loadCounters, saveCounters } from './graph/store';

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

export function mintId(input: MintInput, cwd?: string): string {
  const { type, domain, title, hint } = input;
  const prefix = typePrefix(type);
  const dom = slugify(domain) || 'GENERAL';

  const counters = loadCounters(cwd);

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

export function reserveExistingId(id: string, cwd?: string): void {
  // Mark a manually-supplied/seeded id so future mints don't collide with it.
  const counters = loadCounters(cwd);
  const m = id.match(/^([A-Z]+)-([A-Z0-9]+)-(\d{3,})$/);
  if (m) {
    const key = `${m[1]}-${m[2]}`;
    const n = parseInt(m[3], 10);
    if (!Number.isNaN(n) && (counters[key] ?? 0) < n) {
      counters[key] = n;
    }
  }
  counters[`__collision__${id}`] = (counters[`__collision__${id}`] ?? 0) + 1;
  saveCounters(counters, cwd);
}
