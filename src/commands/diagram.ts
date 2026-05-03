import * as fs from 'fs';
import * as path from 'path';
import { loadGraph } from '../graph/store';
import { buildDiagram, DiagramFormat } from '../compiler/graphToDiagram';
import { fail } from '../output';

export interface DiagramOpts {
  pretty?: boolean;
  format?: DiagramFormat;
  domain?: string;
  node?: string;
  depth?: number;
  out?: string;
}

export function runDiagram(opts: DiagramOpts = {}): void {
  const graph = loadGraph();
  if (opts.node && !graph.nodes[opts.node]) {
    fail(`Node not found: ${opts.node}`);
  }
  const fmt: DiagramFormat = opts.format || 'mermaid';
  if (fmt !== 'mermaid' && fmt !== 'graphviz') {
    fail(`Unknown format: ${fmt}`, { allowed: ['mermaid', 'graphviz'] });
  }
  const out = buildDiagram(graph, {
    format: fmt,
    domain: opts.domain,
    rootId: opts.node,
    depth: opts.depth
  });
  if (opts.out) {
    const abs = path.resolve(process.cwd(), opts.out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, out, 'utf8');
    process.stdout.write(`${path.relative(process.cwd(), abs)}\n`);
    return;
  }
  process.stdout.write(out);
}
