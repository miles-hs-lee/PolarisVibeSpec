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
