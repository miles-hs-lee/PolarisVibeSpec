import { Graph, NodeType, Relation, SpecNode } from '../types';
import { mintId, slugify } from '../ids';
import { listNodes } from '../graph/ops';

interface DomainRule {
  domain: string;
  pattern: RegExp;
}

const DOMAIN_RULES: DomainRule[] = [
  { domain: 'AUTH', pattern: /\b(auth|login|sign[- ]?in|sign[- ]?up|signup|signin|password|token|session|jwt|passkey|2fa|mfa)\b/i },
  { domain: 'BILLING', pattern: /\b(pay|payment|invoice|charge|refund|stripe|subscription|billing|checkout-payment)\b/i },
  { domain: 'ORDER', pattern: /\b(order|cart|checkout|shipping|fulfillment)\b/i },
  { domain: 'NOTIF', pattern: /\b(notif|email|sms|push|alert|webhook)\b/i },
  { domain: 'USER', pattern: /\b(user|profile|account)\b/i }
];

const HTTP_PATH_RE = /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]+)/i;
const ENTITY_HINT = /\b(table|model|entity|record|schema|column|field)\b/i;
const WORKFLOW_HINT = /\b(flow|process|step|pipeline|when\s+.+\s+then|workflow)\b/i;

const DEFAULT_DOMAIN = 'GENERAL';

export interface CompileOptions {
  llm?: boolean;
  cwd?: string;
}

export interface CompileResult {
  nodes: SpecNode[];
  newRelations: Array<{ from: string; to: string; type: Relation['type'] }>;
  notes: string[];
}

export function detectDomain(input: string): string {
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(input)) return rule.domain;
  }
  return DEFAULT_DOMAIN;
}

export function detectType(input: string): { type: NodeType; hint?: string } {
  const httpMatch = input.match(HTTP_PATH_RE);
  if (httpMatch) {
    const verb = httpMatch[1].toUpperCase();
    const pathPart = httpMatch[2];
    return { type: 'api', hint: `${verb}-${slugify(pathPart)}` };
  }
  if (WORKFLOW_HINT.test(input)) return { type: 'workflow' };
  if (ENTITY_HINT.test(input)) return { type: 'entity' };
  return { type: 'requirement' };
}

function tagsFor(domain: string, input: string): string[] {
  const tags = new Set<string>();
  if (domain) tags.add(domain.toLowerCase());
  // Pick up extra signal words.
  for (const rule of DOMAIN_RULES) {
    const m = input.match(rule.pattern);
    if (m && m[0]) tags.add(m[0].toLowerCase().replace(/\s+/g, '-'));
  }
  return Array.from(tags);
}

function titleFor(input: string, type: NodeType): string {
  if (type === 'api') {
    const m = input.match(HTTP_PATH_RE);
    if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  }
  // Strip leading "Add/Build/Create" so titles read cleaner.
  const trimmed = input.trim().replace(/[.;!?]+$/, '');
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

function findReferencedIds(input: string, graph: Graph): string[] {
  const ids = new Set<string>();
  // Direct id mentions like REQ-AUTH-001 / API-AUTH-LOGIN.
  const idRe = /\b([A-Z]+-[A-Z0-9]+(?:-[A-Z0-9_]+)+)\b/g;
  for (const m of input.matchAll(idRe)) {
    if (graph.nodes[m[1]]) ids.add(m[1]);
  }
  return Array.from(ids);
}

export function intentToGraph(
  input: string,
  graph: Graph,
  opts: CompileOptions = {}
): CompileResult {
  const notes: string[] = [];
  if (opts.llm) {
    notes.push('LLM mode requested but not configured; falling back to heuristic compiler.');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { nodes: [], newRelations: [], notes: ['Empty intent — nothing to compile.'] };
  }

  const domain = detectDomain(trimmed);
  const { type, hint } = detectType(trimmed);
  const title = titleFor(trimmed, type);
  const tags = tagsFor(domain, trimmed);

  const id = mintId({ type, domain, title, hint }, opts.cwd);

  const node: SpecNode = {
    id,
    type,
    domain,
    title,
    description: trimmed,
    tags,
    relations: [],
    createdAt: new Date().toISOString()
  };

  const newRelations: CompileResult['newRelations'] = [];

  // Auto-link: explicit ids referenced in the intent.
  for (const refId of findReferencedIds(trimmed, graph)) {
    const refType = graph.nodes[refId].type;
    const explicitImplements = new RegExp(`implements\\s+${refId}`, 'i').test(trimmed);
    const explicitUses = /\b(uses|calls|invokes)\b/i.test(trimmed);
    if (explicitImplements && refType === 'requirement') {
      node.relations.push({ type: 'implements', target: refId });
      newRelations.push({ from: id, to: refId, type: 'implements' });
    } else if (explicitUses) {
      node.relations.push({ type: 'uses', target: refId });
      newRelations.push({ from: id, to: refId, type: 'uses' });
    } else {
      node.relations.push({ type: 'affects', target: refId });
      newRelations.push({ from: id, to: refId, type: 'affects' });
    }
  }

  // Auto-link: shared domain → affects (cap at 3 to keep noise low).
  if (domain !== DEFAULT_DOMAIN) {
    const sameDomain = listNodes(graph, { domain }).slice(0, 3);
    for (const peer of sameDomain) {
      const already = node.relations.some((r) => r.target === peer.id);
      if (already) continue;
      node.relations.push({ type: 'affects', target: peer.id });
      newRelations.push({ from: id, to: peer.id, type: 'affects' });
    }
  }

  return { nodes: [node], newRelations, notes };
}
