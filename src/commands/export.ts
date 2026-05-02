import * as fs from 'fs';
import * as path from 'path';
import { loadGraph } from '../graph/store';
import { getNode } from '../graph/ops';
import { graphToMarkdown } from '../compiler/graphToMarkdown';
import { specsDir } from '../util/paths';
import { emit, fail } from '../output';

export interface ExportOpts {
  pretty?: boolean;
  write?: boolean;
}

export function runExport(id: string, opts: ExportOpts = {}): void {
  const graph = loadGraph();
  const node = getNode(graph, id);
  if (!node) fail(`Node not found: ${id}`);

  const md = graphToMarkdown(node!, graph);

  if (opts.write) {
    const dir = specsDir();
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${id}.md`);
    fs.writeFileSync(target, md, 'utf8');
    emit(
      { ok: true, id, written: path.relative(process.cwd(), target), bytes: Buffer.byteLength(md) },
      { pretty: opts.pretty }
    );
    return;
  }

  // Markdown to stdout — bypass JSON wrapper so Codex can pipe it.
  process.stdout.write(md);
}
