import { loadGraph } from '../graph/store';
import { getNode } from '../graph/ops';
import { addFile } from '../context/codeMap';
import { emit, fail } from '../output';

export interface AddFileOpts {
  pretty?: boolean;
}

export function runAddFile(id: string, filePath: string, opts: AddFileOpts = {}): void {
  const graph = loadGraph();
  if (!getNode(graph, id)) fail(`Node not found: ${id}`);
  const map = addFile(id, filePath);
  emit({ ok: true, id, files: map[id] ?? [] }, { pretty: opts.pretty });
}
