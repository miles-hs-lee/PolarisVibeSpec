import * as fs from 'fs';
import * as path from 'path';
import { loadGraph, loadCodeMap } from '../graph/store';
import { parsePrd } from '../prd/parse';
import { checkPrd, findOrphanIntents, CheckResult } from '../prd/check';
import { buildPrompt } from '../prd/prompt';
import { emit, fail } from '../output';

export interface PrdCheckOpts {
  pretty?: boolean;
  /** In strict mode, report Intent nodes not referenced by any checked PRD. */
  strict?: boolean;
  /**
   * Emit an LLM-friendly Markdown prompt to stdout instead of running
   * Layer 1 checks. Used for semantic alignment via the user's agent.
   */
  prompt?: boolean;
}

const AUTO_DISCOVER_DIRS = ['docs/prd', 'prd', 'prds'];

export function runPrdCheck(paths: string[], opts: PrdCheckOpts = {}): void {
  const cwd = process.cwd();
  const targets = paths.length > 0 ? expandPaths(paths, cwd) : autoDiscover(cwd);

  if (targets.length === 0) {
    fail(
      'No PRD files found. Pass paths, create one of docs/prd/, prd/, prds/, or configure .polaris/prd-sources.json.'
    );
  }

  const graph = loadGraph(cwd);

  if (opts.prompt) {
    runPromptMode(targets, graph, cwd);
    return;
  }

  const fileResults: CheckResult[] = [];
  for (const filePath of targets) {
    const md = fs.readFileSync(filePath, 'utf8');
    const parsed = parsePrd(md, path.relative(cwd, filePath));
    fileResults.push(checkPrd(parsed, graph));
  }

  const orphan = opts.strict ? findOrphanIntents(fileResults, graph) : { intents: [] };
  const allOk =
    fileResults.every((r) => r.ok) && (!opts.strict || orphan.intents.length === 0);

  emit(
    {
      ok: allOk,
      summary: {
        files_checked: fileResults.length,
        files_with_drift: fileResults.filter((r) => !r.ok).length,
        total_references: fileResults.reduce((s, r) => s + r.references.length, 0),
        dangling_references: fileResults.reduce(
          (s, r) => s + r.references.filter((x) => x.status === 'dangling').length,
          0
        ),
        malformed_references: fileResults.reduce(
          (s, r) => s + r.references.filter((x) => x.status === 'malformed').length,
          0
        ),
        orphan_intents: orphan.intents.length,
        strict: !!opts.strict
      },
      files: fileResults,
      orphan_intents: opts.strict ? orphan.intents : undefined
    },
    { pretty: opts.pretty }
  );

  if (!allOk) process.exit(1);
}

function runPromptMode(targets: string[], graph: ReturnType<typeof loadGraph>, cwd: string): void {
  const codemap = loadCodeMap(cwd);
  const blocks: string[] = [];
  for (const filePath of targets) {
    const md = fs.readFileSync(filePath, 'utf8');
    const parsed = parsePrd(md, path.relative(cwd, filePath));
    blocks.push(buildPrompt(parsed, graph, codemap));
  }
  // Prompt mode writes Markdown straight to stdout (not JSON) so it can
  // be piped into an agent.
  process.stdout.write(blocks.join('\n\n---\n\n'));
  process.stdout.write('\n');
}

// ---------- path resolution ----------

function expandPaths(inputs: string[], cwd: string): string[] {
  const out: string[] = [];
  for (const p of inputs) {
    const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
    if (!fs.existsSync(abs)) {
      fail(`Path not found: ${p}`);
    }
    if (fs.statSync(abs).isDirectory()) {
      out.push(...walkMd(abs));
    } else if (abs.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
}

function autoDiscover(cwd: string): string[] {
  // 1. Explicit config wins.
  const cfgPath = path.join(cwd, '.polaris', 'prd-sources.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
      version?: number;
      files?: string[];
      directories?: string[];
    };
    const out: string[] = [];
    for (const f of cfg.files ?? []) {
      const abs = path.resolve(cwd, f);
      if (fs.existsSync(abs)) out.push(abs);
    }
    for (const d of cfg.directories ?? []) {
      const abs = path.resolve(cwd, d);
      if (fs.existsSync(abs)) out.push(...walkMd(abs));
    }
    return out;
  }

  // 2. Convention: first matching directory under cwd.
  for (const dir of AUTO_DISCOVER_DIRS) {
    const abs = path.join(cwd, dir);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return walkMd(abs);
    }
  }

  return [];
}

function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out.sort();
}
