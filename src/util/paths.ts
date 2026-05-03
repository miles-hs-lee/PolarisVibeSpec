import * as path from 'path';

export function polarisDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.polaris');
}

export function graphPath(cwd: string = process.cwd()): string {
  return path.join(polarisDir(cwd), 'graph.json');
}

export function codeMapPath(cwd: string = process.cwd()): string {
  return path.join(polarisDir(cwd), 'codemap.json');
}

export function countersPath(cwd: string = process.cwd()): string {
  return path.join(polarisDir(cwd), 'counters.json');
}

export function specsDir(cwd: string = process.cwd()): string {
  return path.join(polarisDir(cwd), 'specs');
}

/**
 * Normalize a path to forward slashes. Codemap entries and any other
 * cross-machine artifact must use POSIX-style separators so a graph
 * authored on macOS/Linux is readable on Windows and vice versa.
 *
 * Converts BOTH `\\` and `/` to `/` regardless of host OS — relying
 * solely on `path.sep` would skip backslashes when running on POSIX
 * (e.g. cross-platform CI fixtures, copy-pasted Windows paths in a
 * `pv add-file` invocation).
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
