import * as fs from 'fs';
import * as path from 'path';
import { polarisDir } from './paths';

/**
 * Append-only usage log written by `pv ask`. Read by `pv stats` to give
 * the user a numerical handle on their own PV usage. Each line is one
 * invocation. JSONL format so it's both grep-able and parseable.
 *
 * Path: .polaris/usage.jsonl. Best-effort: failures (read-only fs,
 * disk full, ...) silently no-op so the user-facing command never
 * fails because logging broke.
 */

export interface UsageEntry {
  ts: string;
  intent: string;
  recommendation: string;
  shape: string;
  coverage: string | null;
  impacted_count: number;
  total_nodes: number;
  read_set_ratio: number | null;
}

export function logUsage(entry: UsageEntry, cwd: string = process.cwd()): void {
  try {
    const dir = polarisDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'usage.jsonl');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Logging is best-effort. Don't fail user commands on log errors.
  }
}

export function readUsage(cwd: string = process.cwd()): UsageEntry[] {
  try {
    const file = path.join(polarisDir(cwd), 'usage.jsonl');
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8');
    const out: UsageEntry[] = [];
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        // Skip malformed lines silently.
      }
    }
    return out;
  } catch {
    return [];
  }
}
