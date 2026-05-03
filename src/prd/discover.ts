/**
 * Locate PRD files in a repo. Used by `pv prd check` and `pv rename`
 * (and any future PRD-aware command) so they share one convention.
 *
 * Resolution order:
 *   1. .polaris/prd-sources.json (explicit config)
 *   2. First existing directory under: docs/prd, prd, prds
 *
 * Returns absolute paths to *.md files (excluding the auto-generated
 * spec/ directory; PRDs and spec/ live in different places by design).
 */

import * as fs from 'fs';
import * as path from 'path';

const AUTO_DISCOVER_DIRS = ['docs/prd', 'prd', 'prds'];

export function discoverPrds(cwd: string): string[] {
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

  for (const dir of AUTO_DISCOVER_DIRS) {
    const abs = path.join(cwd, dir);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return walkMd(abs);
    }
  }

  return [];
}

export function expandPrdPaths(inputs: string[], cwd: string): string[] {
  const out: string[] = [];
  for (const p of inputs) {
    const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
    if (!fs.existsSync(abs)) {
      throw new Error(`Path not found: ${p}`);
    }
    if (fs.statSync(abs).isDirectory()) {
      out.push(...walkMd(abs));
    } else if (abs.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
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
