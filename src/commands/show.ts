import { loadGraph } from '../graph/store';
import { getNode, incoming } from '../graph/ops';
import { emit, fail } from '../output';

export interface ShowOpts {
  pretty?: boolean;
}

export function runShow(id: string, opts: ShowOpts = {}): void {
  const graph = loadGraph();
  const node = getNode(graph, id);
  if (!node) fail(`Node not found: ${id}`);
  const inc = incoming(graph, id);

  emit(
    {
      ok: true,
      node,
      incoming: inc
    },
    { pretty: opts.pretty }
  );
}
