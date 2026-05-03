import * as fs from 'fs';
import * as path from 'path';
import { loadCodeMap, loadGraph } from '../graph/store';
import { toPosix } from '../util/paths';
import { emit } from '../output';

export interface ValidateOpts {
  pretty?: boolean;
  /**
   * Roots to scan for orphan source files (files that exist on disk but
   * aren't referenced by any codemap entry). Default: ['src']. Set to
   * empty array to disable orphan detection.
   */
  scanRoots?: string[];
}

interface Issue {
  level: 'error' | 'warning';
  kind: string;
  message: string;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function listSourceFiles(root: string, cwd: string): string[] {
  const abs = path.isAbsolute(root) ? root : path.join(cwd, root);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return [];
  const out: string[] = [];
  const stack: string[] = [abs];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        stack.push(full);
      } else if (ent.isFile() && SOURCE_EXTENSIONS.has(path.extname(ent.name))) {
        out.push(toPosix(path.relative(cwd, full)));
      }
    }
  }
  return out;
}

export function runValidate(opts: ValidateOpts = {}): void {
  const cwd = process.cwd();
  const graph = loadGraph(cwd);
  const codeMap = loadCodeMap(cwd);
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

  // Build the set of paths the codemap claims to cover, used both for
  // missing-file checks and for orphan detection.
  const codemappedFiles = new Set<string>();
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
      codemappedFiles.add(file);
      const abs = path.isAbsolute(file) ? file : path.join(cwd, file);
      if (!fs.existsSync(abs)) {
        issues.push({
          level: 'warning',
          kind: 'missing_file',
          message: `${id} -> ${file} (file does not exist)`
        });
      }
    }
  }

  // REQ-PV-008: orphan source detection. Files that exist on disk under
  // the configured roots but aren't referenced by any codemap entry are
  // the leading indicator of a stale graph — someone added code without
  // running `pv add-file <id> <path>`.
  const roots = opts.scanRoots && opts.scanRoots.length > 0 ? opts.scanRoots : ['src'];
  for (const root of roots) {
    for (const file of listSourceFiles(root, cwd)) {
      if (!codemappedFiles.has(file)) {
        issues.push({
          level: 'warning',
          kind: 'orphan_source',
          message: `${file} (exists on disk but no codemap entry; run \`pv add-file <id> ${file}\`)`
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
        codemap_count: Object.keys(codeMap).length,
        scanned_roots: roots
      }
    },
    { pretty: opts.pretty }
  );

  if (errors > 0) process.exit(1);
}
