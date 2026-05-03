/**
 * Parse a PRD Markdown file into structured references and sections.
 *
 * The parser is intentionally permissive: malformed frontmatter or
 * unusual structure produces a `parseWarnings` entry, not an exception.
 * The PRD layer is opt-in — refusing to parse a PRD that the user
 * already has would be hostile.
 *
 * See docs/PRD-DESIGN.md for the directive convention this parser
 * recognizes.
 */

export type RefSource = 'frontmatter' | 'frontmatter-flow' | 'section' | 'body';

export interface PrdReference {
  id: string;
  source: RefSource;
  /** Line number in the file. 1-based. Present for body/section refs. */
  line?: number;
  /** H2 heading text if this reference came from a section directive. */
  section?: string;
}

export interface PrdSection {
  /** H2 heading text, e.g. "Story: Enterprise admin configures policy". */
  heading: string;
  /** 1-based line number of the heading. */
  startLine: number;
  /** 1-based line number where the next H2 (or EOF) begins. */
  endLine: number;
  /** Section body text excluding the heading. */
  body: string;
  /** IDs from `<!-- pv-intents: ... -->` directives in this section. */
  intents: string[];
  /** Optional `<!-- pv-claim: <slug> -->` value. */
  claim?: string;
}

export interface ApiPathMention {
  verb: string;
  path: string;
  line: number;
}

export interface ParsedPrd {
  path: string;
  hasFrontmatter: boolean;
  /** Frontmatter `intents:` list, in declaration order. */
  frontmatterIntents: string[];
  /** Frontmatter `id:` field if present. */
  frontmatterId: string | null;
  /** Frontmatter `title:` field if present. */
  frontmatterTitle: string | null;
  /** Full document body with frontmatter stripped — used by --prompt mode
   *  whole-file fallback so the LLM sees the prose, not just metadata. */
  body: string;
  sections: PrdSection[];
  /** Deduplicated references from all sources, frontmatter-priority. */
  references: PrdReference[];
  apiPathMentions: ApiPathMention[];
  parseWarnings: string[];
}

// Looser than STRICT_ID on purpose: capture anything in body prose that
// *looks* like an Intent id so checkPrd can flag malformed shapes
// (e.g. `REQ-PV` or `REQ-PV-`) instead of silently treating the file as
// an orphan PRD. The lookarounds use `[A-Za-z0-9_-]` rather than `\b` so
// we don't match the `REQ` inside `MY-REQ-001`-style fragments where
// `\b` would falsely fire on the `-`/`R` boundary.
const ID_CANDIDATE = /(?<![A-Za-z0-9_-])(?:REQ|API|WF|ENT)-[A-Z0-9_-]+(?![A-Za-z0-9_-])/g;
const PATH_PATTERN = /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-z0-9/_{}-]+)/gi;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const PV_INTENTS_DIRECTIVE = /<!--\s*pv-intents:\s*([\s\S]*?)\s*-->/g;
const PV_CLAIM_DIRECTIVE = /<!--\s*pv-claim:\s*([A-Za-z0-9_-]+)\s*-->/;

/** Strict ID schema for malformed-id detection. */
export const STRICT_ID = /^(REQ|API|WF|ENT)-[A-Z0-9]+-[A-Z0-9_-]+$/;

export function parsePrd(md: string, filePath: string): ParsedPrd {
  const result: ParsedPrd = {
    path: filePath,
    hasFrontmatter: false,
    frontmatterIntents: [],
    frontmatterId: null,
    frontmatterTitle: null,
    body: md,
    sections: [],
    references: [],
    apiPathMentions: [],
    parseWarnings: []
  };

  let body = md;
  const fm = md.match(FRONTMATTER_PATTERN);
  if (fm) {
    result.hasFrontmatter = true;
    body = md.slice(fm[0].length);
    parseFrontmatter(fm[1], result);
  }
  result.body = body;

  const bodyStartLine = countLines(md.slice(0, md.length - body.length)) + 1;
  parseSections(body, bodyStartLine, result);
  collectApiPaths(body, bodyStartLine, result);
  collectAllReferences(body, bodyStartLine, result);

  return result;
}

// ---------- frontmatter ----------

function parseFrontmatter(fm: string, out: ParsedPrd): void {
  const idMatch = fm.match(/^id:\s*(\S+)\s*$/m);
  if (idMatch) out.frontmatterId = stripQuotes(idMatch[1]);

  const titleMatch = fm.match(/^title:\s*(.+?)\s*$/m);
  if (titleMatch) out.frontmatterTitle = stripQuotes(titleMatch[1]);

  // Flow style: `intents: [REQ-X-001, "API-Y-Z"]`
  const flow = fm.match(/^intents:\s*\[([^\]]*)\]\s*$/m);
  if (flow) {
    for (const raw of flow[1].split(',')) {
      const id = stripQuotes(raw.trim());
      if (id) out.frontmatterIntents.push(id);
    }
    return;
  }

  // Block style:
  //   intents:
  //     - REQ-X-001
  //     - API-Y-Z
  const block = fm.match(/^intents:\s*\r?\n((?:[ \t]+-[ \t]+\S+\r?\n?)+)/m);
  if (block) {
    for (const line of block[1].split(/\r?\n/)) {
      const m = line.match(/^[ \t]+-[ \t]+(\S+)/);
      if (m) out.frontmatterIntents.push(stripQuotes(m[1]));
    }
    return;
  }

  // intents: present but in an unrecognized form.
  if (/^intents:/m.test(fm)) {
    out.parseWarnings.push(
      'frontmatter has `intents:` but it is not in flow ([...]) or block (- item) form; PRD intents not extracted from frontmatter'
    );
  }
}

// ---------- sections ----------

function parseSections(body: string, bodyStartLine: number, out: ParsedPrd): void {
  const lines = body.split(/\r?\n/);
  // Find all H2 starts.
  const h2s: Array<{ index: number; heading: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m) h2s.push({ index: i, heading: m[1] });
  }

  for (let i = 0; i < h2s.length; i++) {
    const { index, heading } = h2s[i];
    const nextIndex = i + 1 < h2s.length ? h2s[i + 1].index : lines.length;
    const sectionLines = lines.slice(index + 1, nextIndex);
    const sectionBody = sectionLines.join('\n');

    const intents: string[] = [];
    let m;
    PV_INTENTS_DIRECTIVE.lastIndex = 0;
    while ((m = PV_INTENTS_DIRECTIVE.exec(sectionBody)) !== null) {
      for (const raw of m[1].split(',')) {
        const id = stripQuotes(raw.trim());
        if (id) intents.push(id);
      }
    }

    const claimMatch = sectionBody.match(PV_CLAIM_DIRECTIVE);

    out.sections.push({
      heading,
      startLine: bodyStartLine + index,
      endLine: bodyStartLine + nextIndex - 1,
      body: sectionBody,
      intents,
      claim: claimMatch ? claimMatch[1] : undefined
    });
  }
}

// ---------- API path mentions ----------

function collectApiPaths(body: string, bodyStartLine: number, out: ParsedPrd): void {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    PATH_PATTERN.lastIndex = 0;
    let m;
    while ((m = PATH_PATTERN.exec(lines[i])) !== null) {
      out.apiPathMentions.push({
        verb: m[1].toUpperCase(),
        path: m[2],
        line: bodyStartLine + i
      });
    }
  }
}

// ---------- reference aggregation ----------

const SOURCE_PRIORITY: Record<RefSource, number> = {
  frontmatter: 4,
  'frontmatter-flow': 3,
  section: 2,
  body: 1
};

function collectAllReferences(body: string, bodyStartLine: number, out: ParsedPrd): void {
  const byId = new Map<string, PrdReference>();

  // Frontmatter refs.
  for (const id of out.frontmatterIntents) {
    upsert(byId, { id, source: 'frontmatter' });
  }

  // Section directive refs.
  for (const section of out.sections) {
    for (const id of section.intents) {
      upsert(byId, {
        id,
        source: 'section',
        line: section.startLine,
        section: section.heading
      });
    }
  }

  // Body prose refs.
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    ID_CANDIDATE.lastIndex = 0;
    let m;
    while ((m = ID_CANDIDATE.exec(lines[i])) !== null) {
      upsert(byId, { id: m[0], source: 'body', line: bodyStartLine + i });
    }
  }

  out.references = Array.from(byId.values());
}

function upsert(map: Map<string, PrdReference>, ref: PrdReference): void {
  const existing = map.get(ref.id);
  if (!existing || SOURCE_PRIORITY[ref.source] > SOURCE_PRIORITY[existing.source]) {
    map.set(ref.id, ref);
  }
}

// ---------- helpers ----------

function stripQuotes(s: string): string {
  return s.replace(/^['"]|['"]$/g, '').trim();
}

function countLines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}
