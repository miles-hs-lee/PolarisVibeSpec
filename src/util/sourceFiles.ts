import * as fs from 'fs';
import * as path from 'path';

/**
 * Count source files under typical roots (src/, lib/, packages/, app/)
 * for read_set_ratio. Best-effort: returns null if no roots exist, so
 * callers can render "N/A" rather than a misleading "0".
 *
 * Skips dotfiles and node_modules. Stops at depth 12 to avoid pathological
 * symlink cycles (we never follow symlinks since `Dirent.isDirectory()`
 * returns false for them by default).
 */

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DEFAULT_ROOTS = ['src', 'lib', 'packages', 'app'];
const MAX_DEPTH = 12;

export function countSourceFiles(cwd: string = process.cwd()): number | null {
  let total = 0;
  let foundAnyRoot = false;

  for (const root of DEFAULT_ROOTS) {
    const abs = path.join(cwd, root);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    foundAnyRoot = true;
    total += walkCount(abs, 0);
  }

  return foundAnyRoot ? total : null;
}

function walkCount(dir: string, depth: number): number {
  if (depth > MAX_DEPTH) return 0;
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      count += walkCount(full, depth + 1);
    } else if (ent.isFile() && SOURCE_EXT.has(path.extname(ent.name))) {
      count += 1;
    }
  }
  return count;
}
