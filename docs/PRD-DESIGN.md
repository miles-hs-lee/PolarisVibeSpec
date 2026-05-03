# PRD layer — design

> Korean version: [PRD-DESIGN.ko.md](PRD-DESIGN.ko.md).

This document describes the *PRD layer* — an opt-in extension to PV
that detects drift between human-authored Product Requirements
Documents and the Intent graph.

This is a **design document**, not a tutorial. For onboarding
instructions see [ADOPTION.en.md](ADOPTION.en.md).

## Scope

**In scope:** PRDs as Markdown files committed to the same git
repository as the codebase. PV reads them, extracts links to Intent
nodes, and reports inconsistencies.

**Explicitly out of scope:**

- Reaching into Notion, Confluence, Google Docs, or any SaaS API
- Parsing HWP, docx, PDF, or any non-Markdown format
- Auto-generating PRDs from existing source code
- Owning the PRD authoring experience (no "PV PRD editor")
- Managing PRD review/approval workflows (use GitHub PRs for that)

If your PRDs live in Notion or HWP, convert them to Markdown and
commit to git first. PV begins from there.

## Why an opt-in PRD layer at all

PV's core value (Intent graph + codemap + validation) works without
PRDs. The PRD layer is for teams who already write PRDs and want to
catch one specific failure mode:

> The PRD says we ship X, but the codebase doesn't model X — or vice
> versa.

In small teams this is caught by memory. As soon as memory fails — new
hires, time, AI agents editing code — the gap becomes invisible until
someone notices a regression. The PRD layer makes the gap *visible*
at PR time and CI time.

## Two scenarios

### Scenario A: existing codebase, no PRDs

**Recommendation: don't retrofit PRDs from existing code.** PRDs are
forward-looking documents about *what we want to build*. Generating
them from completed code produces hollow tautologies ("the system has
a login endpoint" — yes, we know).

Existing code's archaeology — *why was this built this way?* — belongs
in the `description` field of Intent nodes, not in fake PRDs. Use
`pv bootstrap --prompt` to scaffold the Intent graph from `src/`,
then start writing PRDs only for *new* initiatives going forward.

### Scenario B: existing PRDs as Markdown in git

This is the supported onboarding path. See "Onboarding" below.

## Architecture

The PRD layer is small. It adds:

- A directive convention (`<!-- pv-intents: ... -->` HTML comments)
- Two new modules (`src/prd/parse.ts`, `src/prd/check.ts`)
- One new command (`pv prd check`)
- One opt-in mode (`pv prd check --prompt`)

It does **not** add:

- A new source-of-truth file (PRDs stay where they are)
- A schema PV owns (PRD authoring is the user's responsibility)
- A new node type in `graph.json` (PRDs are external bookmarks into the
  graph, not graph members)

## The directive convention

PRDs link to the Intent graph in three ways, in priority order:

1. **Frontmatter `intents:`** — global summary for the whole PRD

   ```yaml
   ---
   id: PRD-AUTH-PASSKEY
   title: Passwordless authentication
   intents: [REQ-AUTH-001, REQ-AUTH-002, API-AUTH-PASSKEY]
   ---
   ```

2. **Section directives** — per-H2-section linking, lets `--prompt`
   mode emit focused per-section prompts instead of one giant prompt

   ```markdown
   ## Story: Enterprise admin configures passkey policy

   ...prose...

   <!-- pv-intents: API-AUTH-CONFIG, REQ-AUTH-003 -->
   <!-- pv-claim: enterprise-admin-config -->
   ```

3. **Body mentions** — IDs found in the prose (regex-matched)

   ```markdown
   This story extends [REQ-AUTH-002](../spec/REQ-AUTH-002.md) with
   organization-level enforcement.
   ```

When the same ID appears in multiple sources, frontmatter wins, then
section directive, then body mention. This priority lets `pv prd check`
report the most authoritative source for each reference.

## The three-layer check model

### Layer 1: structural — `pv prd check`

Deterministic, LLM-free, CI-friendly. Catches:

- **dangling**: PRD references an Intent ID that doesn't exist in graph
- **malformed**: PRD references a string that looks like an ID but
  doesn't match the schema (e.g. `REQ-X` without the trailing number)
- **orphan PRD** (warning): PRD has *zero* Intent references (in any
  source)

This layer alone catches surface-level drift — renamed Intents, deleted
Intents that PRDs still reference, typos. It does *not* catch semantic
drift.

### Layer 2: heuristic — `pv prd check --fuzzy` (future)

Surface keyword/path matching. Currently deferred. Notes:

- API path mentions (`POST /auth/passkey`) that don't match any API
  node title — already implemented as a warning in Layer 1's check
- Domain-specific keyword extraction is noisy (false positives on
  generic words). Not worth building until there's clear demand.

### Layer 3: LLM-assisted — `pv prd check --prompt`

Emits a structured Markdown prompt that the user runs through their
own coding agent (Claude Code, Codex, etc.). The prompt asks the LLM
to identify:

1. Claims in the PRD prose that don't appear as Intent nodes
2. Intent nodes that contradict claims in the prose
3. Synonyms (PRD says "passwordless", graph says "passkey")
4. Intent nodes the PRD probably should reference but doesn't

The agent returns a structured JSON report. The user reviews and acts:
add nodes via `pv generate`, rename, edit prose, etc.

PV does **not** call the LLM itself. Same pattern as `pv generate
--prompt`, `pv enrich --prompt`. Reasons:

- No API keys to manage in PV
- No model-vendor lock-in
- User pays for their own tokens
- The agent already has Read/Edit tools to apply suggestions

## Section-level decomposition (why it matters)

Without section directives, `--prompt` mode would have to send the
entire PRD plus the entire Intent graph to the LLM. This is:

- Token-expensive at any non-trivial PRD size
- Noisy (most graph nodes are irrelevant to a given claim)
- Imprecise (LLM has to figure out what's relevant)

Section directives let PV emit *one prompt per section*, each
including only:

- That section's prose
- The Intent nodes listed in `<!-- pv-intents: ... -->`
- Their immediate neighbors in the graph (1-hop, optional)
- Their codemap files

A 5-section PRD becomes 5 small focused prompts instead of one huge
unfocused one. This is the same insight that makes `pv impact` valuable
for code: focused subset beats whole-repo scan.

## Onboarding gradient

Each level is a strict superset of the previous. Stop at any level.

| Level | What you do | What you get |
|---|---|---|
| 0 | Don't use the PRD layer | PV with Intent only, works fine |
| 1 | `pv prd check` on existing PRDs | Body-mention dangling check |
| 2 | Add `intents:` to frontmatter | Explicit per-PRD linkage |
| 3 | Add `<!-- pv-intents: -->` per section | Section-scoped reporting + focused `--prompt` |
| 4 | Use `--prompt` periodically | LLM-assisted semantic drift detection |
| 5 | Multi-file PRDs (one file per claim) | Per-file git history, team-friendly |

Most teams should aim for Level 3. Level 5 is for very large PRDs.

## Auto-discovery

When `pv prd check` is invoked with no path arguments, it looks for
PRDs in this order:

1. `.polaris/prd-sources.json` — explicit config (optional)
2. `docs/prd/` — recursive `**/*.md`
3. `prd/` — recursive `**/*.md`
4. `prds/` — recursive `**/*.md`

If none of these exist and no paths are passed, PV exits with a clear
"no PRDs found, pass paths or create a `docs/prd/` directory" message.

`prd-sources.json` schema:

```json
{
  "version": 1,
  "files": ["docs/specs/passkey.md"],
  "directories": ["docs/prd", "internal/prd"]
}
```

## PRD-Intent relationship — bookmark, not contract

This is a critical design decision. The relationship between PRDs and
Intent nodes is **one-way and lightweight**:

- PRDs reference Intent nodes (forward link)
- Intent nodes do not know about PRDs (sovereign)
- A new Intent does not need to update any PRD
- An Intent without a PRD reference is *not* drift

This matches PV's existing layer pattern: codemap references graph,
graph doesn't track codemap; spec/ is derived from graph, graph
doesn't track spec/. PRDs reference graph, graph doesn't track PRDs.

The opt-in `--strict` flag flips the default: it reports Intent nodes
that no checked PRD references. Most teams should leave this off —
many Intents (infrastructural entities, bug-fix REQs) legitimately
have no product PRD origin.

## What PV does NOT do (explicit non-goals)

- ❌ Manage PRD review workflows (comments, approvers, sign-off)
- ❌ Render PRDs as a hosted website or wiki
- ❌ Track PRD lifecycle metadata beyond what's in frontmatter
- ❌ Auto-update PRD prose when Intent nodes change
- ❌ Detect cross-PRD redundancy or conflict
- ❌ Generate or recommend PRD content
- ❌ Provide a GUI

## Tooling priority

| Command | Priority | Phase |
|---|---|---|
| `pv prd check [path...]` | P0 | 1 |
| `pv prd check --prompt` | P0 | 1 |
| `pv prd template <slug>` | P1 | 2 |
| `pv prd decompose --prompt` | P1 | 2 |
| `pv prd lint` | P2 | 3 |
| `pv prd link <file> --section ... --intent ...` | P2 | 3 |

Phase 1 (P0) ships first. Each phase ships independently.

## Output format

`pv prd check` emits JSON by default (PV convention) and a
human-readable form with `--pretty`.

```json
{
  "ok": false,
  "summary": {
    "files_checked": 2,
    "files_with_drift": 1,
    "total_references": 7,
    "dangling_references": 1,
    "orphan_prds": 0
  },
  "files": [
    {
      "path": "docs/prd/passkey.md",
      "ok": false,
      "references": [
        { "id": "REQ-AUTH-002", "source": "frontmatter", "status": "ok" },
        { "id": "REQ-AUTH-007", "source": "body", "line": 42, "status": "dangling" }
      ],
      "warnings": []
    }
  ]
}
```

Exit codes:
- `0` — all checks passed
- `1` — drift detected (dangling references, or `--strict` orphan
  Intents)
- `2` — IO/parse error

## Phase 1 (P0) — what ships

- `src/prd/parse.ts` — `parsePrd(md, path) → ParsedPrd`
- `src/prd/check.ts` — `checkPrd(parsed, graph) → CheckResult`
- `src/prd/prompt.ts` — `buildPrompt(parsed, graph) → string` for
  `--prompt` mode
- `src/commands/prdCheck.ts` — orchestration + auto-discovery + IO
- `src/cli.ts` — register `pv prd check` subcommand
- `test/prd-parse.test.ts`, `test/prd-check.test.ts`,
  `test/prd-prompt.test.ts`

What does NOT ship in Phase 1: `template`, `decompose`, `lint`,
`link`. Those wait for Phase 2 demand.

## Honest limits

This design will not catch every meaningful drift:

- A PRD that *paraphrases* a missing concept without naming an Intent
  ID won't be caught by Layer 1. The `--prompt` mode catches some of
  these but is non-deterministic.
- Section directives must be hand-written (or generated via Phase 2's
  `decompose --prompt`). Forgetting them means that section is checked
  with global frontmatter context only — broader, less focused.
- Auto-discovery is path-convention based. Teams using non-standard
  locations need `prd-sources.json` or explicit paths.
- `--prompt` results depend on the LLM the user runs them through.
  Different agents will produce different reports. PV is not the
  authority — the user is.

These are intentional design choices, not future bugs. The alternative
(LLM-in-PV, schema-strict PRD format, auto-everything) trades
simplicity for fragility in a way the rest of PV avoids.
