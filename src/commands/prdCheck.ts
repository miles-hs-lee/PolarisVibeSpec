import * as fs from 'fs';
import * as path from 'path';
import { loadGraph, loadCodeMap } from '../graph/store';
import { parsePrd } from '../prd/parse';
import { checkPrd, findOrphanIntents, CheckResult } from '../prd/check';
import { buildPrompt } from '../prd/prompt';
import { discoverPrds, expandPrdPaths } from '../prd/discover';
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

export function runPrdCheck(paths: string[], opts: PrdCheckOpts = {}): void {
  const cwd = process.cwd();
  let targets: string[];
  try {
    targets = paths.length > 0 ? expandPrdPaths(paths, cwd) : discoverPrds(cwd);
  } catch (e) {
    fail((e as Error).message);
  }

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

