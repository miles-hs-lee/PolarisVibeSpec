import * as fs from 'fs';
import * as path from 'path';
import { loadCodeMap, loadGraph } from '../graph/store';
import { emit } from '../output';

export interface ValidateOpts {
  pretty?: boolean;
}

interface Issue {
  level: 'error' | 'warning';
  kind: string;
  message: string;
}

export function runValidate(opts: ValidateOpts = {}): void {
  const graph = loadGraph();
  const codeMap = loadCodeMap();
  const issues: Issue[] = [];

  const ids = new Set<string>();

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (id !== node.id) {
      issues.push({
        level: 'error',
        kind: 'id_mismatch',
        message: `Graph key '${id}' does not match node.id '${node.id}'.`
      });
    }
    if (ids.has(node.id)) {
      issues.push({
        level: 'error',
        kind: 'duplicate_id',
        message: `Duplicate node id: ${node.id}`
      });
    }
    ids.add(node.id);

    for (const rel of node.relations) {
      if (!graph.nodes[rel.target]) {
        issues.push({
          level: 'error',
          kind: 'dangling_relation',
          message: `${node.id} -[${rel.type}]-> ${rel.target} (target missing)`
        });
      }
    }
  }

  for (const [id, files] of Object.entries(codeMap)) {
    if (!graph.nodes[id]) {
      issues.push({
        level: 'error',
        kind: 'codemap_orphan',
        message: `Codemap entry '${id}' references unknown node.`
      });
      continue;
    }
    for (const file of files) {
      const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
      if (!fs.existsSync(abs)) {
        issues.push({
          level: 'warning',
          kind: 'missing_file',
          message: `${id} -> ${file} (file does not exist)`
        });
      }
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  emit(
    {
      ok: errors === 0,
      issues,
      summary: {
        errors,
        warnings: issues.length - errors,
        node_count: Object.keys(graph.nodes).length,
        codemap_count: Object.keys(codeMap).length
      }
    },
    { pretty: opts.pretty }
  );

  if (errors > 0) process.exit(1);
}
