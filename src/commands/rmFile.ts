import { removeFile } from '../context/codeMap';
import { emit } from '../output';

export interface RmFileOpts {
  pretty?: boolean;
}

export function runRmFile(id: string, filePath: string, opts: RmFileOpts = {}): void {
  const map = removeFile(id, filePath);
  emit({ ok: true, id, files: map[id] ?? [] }, { pretty: opts.pretty });
}
