import * as fs from 'fs';
import * as path from 'path';
import { CodeMap, Graph, NodeType, SpecNode } from '../types';
import { writeJsonAtomic } from '../util/atomic';
import { polarisDir } from '../util/paths';
import { emit, fail } from '../output';

export interface BootstrapOpts {
  pretty?: boolean;
  /** Default 'src'. Pass to scan a different root (lib, packages, etc.). */
  scanRoot?: string;
}

interface Proposal {
  node: SpecNode;
  files: string[];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// First-level subdirs treated as utility/shared rather than a real domain.
const SHARED_DIRS = new Set(['shared', 'utils', 'util', 'lib', 'common', 'helpers', 'core']);

const SKIP_PATTERNS: RegExp[] = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /^index\.[jt]sx?$/i,
  /^_/,
  /\.d\.ts$/
];

// Suffixes/keywords typical of API/handler files.
const API_NAME_SUFFIX = /(handler|controller|route|endpoint|server|router|api|view)$/i;
// Verbs commonly found as bare filenames for API actions.
const API_NAME_VERB = /^(signup|signin|login|logout|register|subscribe|unsubscribe|checkout|fulfill|charge|refund|reset|verify|confirm|approve|reject|publish|archive|invite)$/i;
const WORKFLOW_NAME = /(flow|workflow|orchestrat|pipeline|process|saga)/i;
const ENTITY_NAME = /^(user|order|cart|invoice|subscription|account|profile|product|item|record|model|schema|repository|repo|payment|session|token|customer|address|notification|notify)$/i;

const HTTP_VERB_RE = /\b(POST|GET|PUT|DELETE|PATCH)\s+\/[\w/-]/;
const TYPE_DEF_RE = /^(export\s+)?(class|interface|type)\s+[A-Z]\w*/m;

function slugify(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isSkipped(filename: string): boolean {
  return SKIP_PATTERNS.some((r) => r.test(filename));
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        stack.push(path.join(dir, ent.name));
      } else if (ent.isFile() && SOURCE_EXT.has(path.extname(ent.name)) && !isSkipped(ent.name)) {
        out.push(path.join(dir, ent.name));
      }
    }
  }
  return out;
}

function readSnippet(absFile: string, maxBytes: number = 4096): string {
  try {
    const fd = fs.openSync(absFile, 'r');
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).toString('utf8');
  } catch {
    return '';
  }
}

interface ClassifyResult {
  type: NodeType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

function classify(absFile: string, content: string): ClassifyResult | null {
  const base = path.basename(absFile, path.extname(absFile));

  if (HTTP_VERB_RE.test(content)) {
    return { type: 'api', confidence: 'high', reason: 'HTTP verb literal in file' };
  }
  if (API_NAME_SUFFIX.test(base)) {
    return { type: 'api', confidence: 'high', reason: `name ends with '${base.match(API_NAME_SUFFIX)![0]}'` };
  }
  if (API_NAME_VERB.test(base)) {
    return { type: 'api', confidence: 'high', reason: `'${base}' is an action-verb filename (likely an API)` };
  }
  if (WORKFLOW_NAME.test(base)) {
    return { type: 'workflow', confidence: 'high', reason: `name '${base}' suggests a workflow` };
  }
  if (ENTITY_NAME.test(base)) {
    return { type: 'entity', confidence: 'medium', reason: `name '${base}' suggests an entity` };
  }
  if (TYPE_DEF_RE.test(content)) {
    return { type: 'entity', confidence: 'low', reason: 'top-level class/interface/type definition' };
  }
  // Default: don't propose a node. Better to under-propose than spam.
  return null;
}

function deriveDomain(absFile: string, scanRootAbs: string): string {
  const rel = path.relative(scanRootAbs, absFile);
  const parts = rel.split(path.sep);
  if (parts.length === 1) return 'ROOT';
  const first = parts[0].toLowerCase();
  if (SHARED_DIRS.has(first)) return 'SHARED';
  return slugify(first);
}

function typePrefix(type: NodeType): string {
  switch (type) {
    case 'requirement': return 'REQ';
    case 'api':         return 'API';
    case 'workflow':    return 'WF';
    case 'entity':      return 'ENT';
  }
}

function deriveTitle(absFile: string, type: NodeType): string {
  const base = path.basename(absFile, path.extname(absFile));
  const words = base
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  switch (type) {
    case 'api':       return words;
    case 'workflow':  return `${words} flow`;
    case 'entity':    return `${words} record`;
    default:          return words;
  }
}

export function runBootstrap(opts: BootstrapOpts = {}): void {
  const cwd = process.cwd();
  const scanRoot = opts.scanRoot || 'src';
  const absScanRoot = path.resolve(cwd, scanRoot);

  if (!fs.existsSync(absScanRoot)) {
    fail(`Scan root not found: ${scanRoot}`, { hint: 'Pass --root <dir> to scan elsewhere.' });
  }
  if (!fs.statSync(absScanRoot).isDirectory()) {
    fail(`Scan root is not a directory: ${scanRoot}`);
  }

  const polDir = polarisDir(cwd);
  const outGraph = path.join(polDir, 'graph.bootstrap.json');
  const outCodemap = path.join(polDir, 'codemap.bootstrap.json');

  const files = listFilesRecursive(absScanRoot);
  const proposals: Proposal[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];

  for (const absFile of files) {
    const relFile = path.relative(cwd, absFile);
    const content = readSnippet(absFile);
    const cls = classify(absFile, content);
    if (!cls) {
      skipped.push({ file: relFile, reason: 'no clear type signal' });
      continue;
    }
    const domain = deriveDomain(absFile, absScanRoot);
    const slug = slugify(path.basename(absFile, path.extname(absFile)));
    const id = `${typePrefix(cls.type)}-${domain}-${slug}`;

    const node: SpecNode = {
      id,
      type: cls.type,
      domain,
      title: deriveTitle(absFile, cls.type),
      description:
        `Auto-proposed by \`pv bootstrap\` — ${cls.confidence} confidence (${cls.reason}). ` +
        `Edit this description to capture intent before committing. Add REQ nodes for the goals this serves and \`relations\` (implements / uses / affects / depends_on) to wire it into the graph.`,
      tags: [domain.toLowerCase(), cls.type],
      relations: [],
      createdAt: new Date().toISOString()
    };

    proposals.push({ node, files: [relFile], confidence: cls.confidence, reason: cls.reason });
  }

  // De-dup: multiple files producing the same id (e.g. two `repository.ts`
  // under different domains is rare given domain is part of id, but two
  // helpers under the same dir can collide). Merge codemap entries.
  const merged = new Map<string, Proposal>();
  for (const p of proposals) {
    const existing = merged.get(p.node.id);
    if (existing) {
      for (const f of p.files) if (!existing.files.includes(f)) existing.files.push(f);
    } else {
      merged.set(p.node.id, p);
    }
  }

  const graph: Graph = {
    version: 1,
    nodes: Object.fromEntries(Array.from(merged.values()).map((p) => [p.node.id, p.node]))
  };
  const codemap: CodeMap = Object.fromEntries(
    Array.from(merged.values()).map((p) => [p.node.id, p.files])
  );

  writeJsonAtomic(outGraph, graph);
  writeJsonAtomic(outCodemap, codemap);

  const byConfidence = { high: 0, medium: 0, low: 0 };
  const byType: Record<NodeType, number> = { requirement: 0, api: 0, workflow: 0, entity: 0 };
  const domains = new Set<string>();
  for (const p of merged.values()) {
    byConfidence[p.confidence]++;
    byType[p.node.type]++;
    domains.add(p.node.domain);
  }

  emit(
    {
      ok: true,
      out_graph: path.relative(cwd, outGraph),
      out_codemap: path.relative(cwd, outCodemap),
      summary: {
        files_scanned: files.length,
        nodes_proposed: merged.size,
        files_skipped: skipped.length,
        by_confidence: byConfidence,
        by_type: byType,
        domains: Array.from(domains).sort()
      },
      next_steps: [
        `1. Review ${path.relative(cwd, outGraph)} — fix titles, fill descriptions with intent, add REQ nodes`,
        `2. Wire relations: add 'implements' from APIs to REQs, 'uses' between modules`,
        `3. Review ${path.relative(cwd, outCodemap)} — extend codemap entries with related files`,
        `4. When happy: mv .polaris/graph.bootstrap.json .polaris/graph.json (and codemap)`,
        `5. pv validate — orphan_source warnings tell you what's still uncovered`
      ],
      skipped_examples: skipped.slice(0, 5)
    },
    { pretty: opts.pretty }
  );
}
