# Positioning

This document records what Polaris Vibe Spec is, what it is *not*, how
it relates to neighboring tools, and how knowledge is organized inside
the project. It exists so future contributors don't have to re-derive
the reasoning behind the README and design decisions.

## What PV is

A repo-local intent traceability checker for AI-era codebases. PV's
distinguishing claim:

> The graph itself is the value — a structured, queryable, validatable
> intent layer that one schema serves to both humans and AI agents.
> When code changes, PV catches divergence from that layer at PR time.

Two operations carry the headline:

- **`pv changed`** — at PR time, a deterministic structural drift
  gate. Joins `git diff` against the codemap and PRDs to surface
  orphan files, broken codemap entries, and Intent nodes whose linked
  PRD sections may need updates. Exits non-zero on warn/error so CI
  can gate.
- **`pv review --prompt`** — semantic drift review. Same diff input,
  but emits a structured prompt for the user's coding agent to
  identify intent-description mismatches, missing Intent nodes, PRD
  contradictions, and codemap link issues. PV doesn't call the LLM
  itself; the user reviews proposed patches before applying.

Everything else in PV — the graph, codemap, `validate`, `export-all`,
`promote`, `why`, `impact`, `prd check`, etc. — supports those two by
maintaining the intent layer that the gates check against.

## What PV is *not*

- **Not a code-derived knowledge graph.** Tools like Sourcegraph,
  Glean, GitHub Code Navigation, tree-sitter, or LSP-driven indexers
  extract structure *from* code (imports, function calls, type
  graphs). PV captures the *opposite*: hand-authored intent that the
  code *implements*. Most teams want both; the structural tools
  answer "what calls this?", PV answers "why does this exist?".

- **Not a PRD authoring tool.** PRDs stay in your existing
  documentation flow — Markdown in git, exported from Notion, etc.
  PV's `pv prd check` validates references against the graph; PV
  doesn't host, edit, or template PRDs.

- **Not a project management or ticketing system.** No issues,
  sprints, owners, status workflows. The graph captures *current
  architecture*, not in-flight work.

- **Not an LLM API consumer.** PV emits structured prompts (`pv
  generate --prompt`, `pv enrich --prompt`, `pv prd check --prompt`,
  `pv review --prompt`); the user pipes them to whichever coding
  agent they already use. PV doesn't manage API keys, model selection,
  or token billing.

- **Not a GUI.** PV is a CLI. Diagrams are emitted as Mermaid /
  Graphviz for the user's existing renderer. The `spec/` directory is
  Markdown for the user's existing reader (GitHub, IDE preview, etc.).

## How project knowledge is organized

A natural question, especially for reimplementers: "is the graph the
only source of truth?" The honest answer is **no — PV deliberately
splits knowledge across four layers**, each with its own canonical
artifact, derived artifacts, and consistency mechanism.

```
┌──────────────────────────────────────────────────────────────┐
│ INTENT — "what should exist"                                 │
│   .polaris/graph.json     ◄─ canonical (the spec)            │
│   .polaris/codemap.json   ◄─ canonical (intent ↔ code map)   │
│   spec/<id>.md            ◄─ derived view (regen via export-all)
│   docs/prd/*.md           ◄─ canonical (PRD prose; checked   │
│                              against graph by pv prd check)  │
└──────────────────────────────────────────────────────────────┘
        ▲                                  │
        │ pv promote (prose only)          │ pv validate
        │ pv changed / pv review (drift)   │ pv prd check
        │                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ BEHAVIOR — "how it actually works"                           │
│   src/**/*.ts             ◄─ canonical (runtime truth)       │
│   test/**/*.test.ts       ◄─ canonical (verified behavior)   │
│   dist/cli.js             ◄─ derived (build output)          │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ justified by
        │
┌──────────────────────────────────────────────────────────────┐
│ RATIONALE — "why these choices"                              │
│   experiments/            ◄─ empirical evidence              │
│   docs/POSITIONING.md     ◄─ this file                       │
│   docs/ARCHITECTURE.md    ◄─ design choices, algorithms      │
│   docs/PRD-DESIGN.md      ◄─ PRD layer rationale             │
│   CHANGELOG.md            ◄─ temporal record                 │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ guides
        │
┌──────────────────────────────────────────────────────────────┐
│ USAGE — "how to use it"                                      │
│   README.md               ◄─ entry point                     │
│   docs/ADOPTION.{en,ko}   ◄─ user walkthrough                │
│   CONTRIBUTING.md         ◄─ contributor workflow            │
│   skills/pv/SKILL.md      ◄─ optional agent integration      │
└──────────────────────────────────────────────────────────────┘
```

### Each layer in detail

**1. Intent — what the project says it should be.**
The canonical artifacts are `.polaris/graph.json` (nodes + relations),
`.polaris/codemap.json` (node → file paths), and the user-authored
PRDs in `docs/prd/`. `spec/<id>.md` is a *derived view* — regenerated
by `pv export-all` and never read back as source (with the one
exception of `pv promote`, which applies prose-only edits to title /
tags / description; structural changes are rejected). This layer
answers "what nodes exist, how do they relate, and what prose intent
references them?".

**2. Behavior — how the code actually runs.**
Canonical artifacts are `src/**/*.ts` and the `test/**/*.test.ts`
suite (~250 tests covering every CLI command end-to-end plus pure
helpers). `dist/cli.js` is a build artifact. Tests assert that
behaviors match what the graph descriptions claim — for instance,
that `pv impact` returns the asymmetric BFS the
`API-PV-IMPACT` description specifies, that `pv prd check` flags
malformed body IDs, that `pv changed` exits 1 on drift.

**3. Rationale — why each design choice was made.**
The benches under `experiments/` are the empirical foundation for
specific design decisions: bench-006 anchors the `pv prd check
--prompt` design (4/4 actionable signals on planted PRD drift),
bench-007 anchors the `pv review --prompt` design (4/4 hits on
planted intent-layer drift, 0 false positives on the aligned
control). `docs/ARCHITECTURE.md` records algorithm-level design
(asymmetric BFS direction, classifier rules, ID format).
`docs/PRD-DESIGN.md` records the PRD layer's design constraints.

**4. Usage — how a user actually adopts and operates the tool.**
`README.md` is the entry point. `docs/ADOPTION.{en,ko}.md` walks new
users through a real adoption. `CONTRIBUTING.md` describes the PR
workflow including the dogfooded `pv changed` step. `skills/pv/`
bundles a Claude Code skill that loads only when triggered.

### Consistency mechanisms

| Constraint | Enforced by |
|---|---|
| `graph.json` references valid node ids | `pv validate` (dangling relation targets) |
| `codemap.json` files exist on disk | `pv validate` (missing files) |
| Source files under `src/` are referenced by some codemap entry | `pv validate` (orphan source files) |
| `spec/<id>.md` matches graph state | `pv export-all` + `npm run spec:check` (CI) |
| Embedded diagrams in `ARCHITECTURE.md` match graph | `scripts/regen-diagrams.py` + `npm run diagrams:check` (CI) |
| PRD references resolve to existing Intent nodes | `pv prd check` (CI step when `docs/prd/` exists) |
| PR introduces graph-touching code change with stale codemap | `pv changed` (Phase 3 GitHub Action; locally any time) |
| Behavior matches what the graph claims | `npm test` (~250 cases against the run* command surface) |

What's **not** enforced (intentional gaps):

- **Semantic drift between code and intent prose.** `pv review
  --prompt` surfaces it via an LLM, but the result is non-deterministic
  — the same prompt through different agents may produce different
  patches. PV is not the authority; the user reviews each proposal.
- **Rationale stays valid.** A bench result can be re-run and produce
  a different number; no automated check surfaces that a design
  decision's empirical basis is now stale.
- **Usage docs match CLI.** README and ADOPTION reference command
  flags in prose; if a flag is renamed, only manual review catches it.

### Why this layering

A common alternative is "everything in one place" — make the graph the
sole source of truth, encode algorithms as pseudocode in node
descriptions, embed test cases as fields, link rationale by reference.
PV deliberately doesn't do that:

1. **Different audiences read different layers.** A user adopting PV
   reads README + ADOPTION, not `graph.json`. A reimplementer reads
   experiments + ARCHITECTURE. A PR reviewer reads `pv changed`
   output, not the whole graph.
2. **Drift is bounded per-layer.** When code changes, `pv changed` +
   `pv validate` catch graph drift — not 50 fields of description
   prose.
3. **Each artifact stays small enough to be useful.** A `graph.json`
   that contains algorithms, examples, decision rationale, and usage
   snippets is no longer a graph — it's a 5MB document that no tool
   can usefully query.

The cost is that no single file is "the project." A reader has to
follow links across layers to get the full picture. The benefit is
that each artifact does one thing well: the graph queries cleanly,
the code runs cleanly, the experiments reproduce cleanly, the docs
read cleanly.

## Where PV sits in the landscape

Several adjacent niches; none of them is exactly PV's combination.

### Architecture documentation (closest spirit)

- **[Structurizr](https://structurizr.com/) / [C4 model](https://c4model.com/)**
  — Simon Brown's architecture-as-code tooling. The closest mental
  cousin. Both encode architectural intent in a structured text
  artifact; both produce a graph of nodes + relations. The divergence
  is in *consumer*:

  - Structurizr DSL → System Context / Container / Component / Code
    views, optimized for humans browsing diagrams. Rich layout,
    multiple views per workspace, Cloud rendering.
  - PV `.polaris/graph.json` → flat node list + typed relations,
    optimized for queries by both humans (`pv export-all`,
    `pv diagram`, `pv why`) and an AI coding agent (`pv impact`,
    `pv changed`, `pv review`).

  Conceptual mapping (lossy in both directions):

  | Structurizr | PV |
  |---|---|
  | `softwareSystem` | (no equivalent — PV assumes single system) |
  | `container` | `entity` (broad) or `workflow` |
  | `component` | `entity` or `api` |
  | `relationship` | `relations` (uses, depends_on, implements, affects) |
  | `views` (auto-rendered) | `pv diagram` (per-view) |

  An interop layer (`pv import-structurizr` / `pv export-structurizr`)
  is plausible future work but not built. The honest framing: PV and
  Structurizr are different optimal points in the same design space.
  A team using both could let Structurizr handle diagram-heavy
  stakeholder communication while PV drives the agent-aware spec and
  PR-time drift gate.

- **[arc42](https://arc42.org/)** — markdown architecture template.
  Static, no graph, no tooling, no drift detection.

- **Architectural Decision Records (ADRs)** — markdown decision logs
  in `docs/adr/`. PV operates one level above: ADRs record *decisions*,
  PV records the *architecture* those decisions shape. They compose
  cleanly — an ADR can reference a PV node id (`Decision: extract
  ENT-AUTH-USER from BILLING domain`).

### Spec-first / contract-first

- **OpenAPI / GraphQL / Protobuf** — spec drives generated code, but
  for *interfaces* (HTTP, gRPC) only. PV operates at the architectural
  level above interfaces.
- **TypeSpec (Microsoft)** — multi-format API spec.
- **Domain-Driven Design tooling** (Context Map editors) — bounded
  contexts + relationships. Closer to PV's intent layer but usually
  stopping at diagrams.

### Code-level dependency graphs

- **Bazel / Buck / Pants BUILD files** — explicit build-target
  dependency graph. File/target level, mechanical, not intent-level.
- **CODEOWNERS** — file → team mapping. One axis (ownership), not a
  full graph.

### AI-agent steering

- **`.cursorrules` / Cline rules / `CLAUDE.md`** — text-based steering
  for an agent. No graph; no validation; no code mapping.
- **Skills (Claude Code) / MCP servers** — tool/skill packaging.
  Orthogonal to PV (and PV ships a skill).

### Knowledge graphs / code search

- **Sourcegraph / GitHub Code Search / tree-sitter / LSP / Glean** —
  search and navigation over *existing code*. No intent layer; the
  graph is derived from code, not authored above it.

### The empty quadrant PV aims at

|                                | Human-authored intent                         | Code-derived (mechanical)         |
|---|---|---|
| **Diagram / docs output**      | Structurizr / C4 / arc42 / ADRs               | (autogenerated dep graphs)        |
| **Agent-aware CLI + drift gate** | **Polaris Vibe Spec**                       | Sourcegraph, LSP-driven tools     |

Most existing tools are either docs-for-humans (left column) or
mechanical-extraction (right column). The "intent authored by a
person, queryable by both a person and an agent, validated against
real code at PR time" combination is what PV occupies.

## Open questions

1. **How well does the graph hold up at 1k+ files?** Validation
   pipeline scales linearly (it's just JSON), but maintenance cost on
   a hand-authored layer might grow nonlinearly with team size.
2. **`pv review --prompt` cost on huge PRs.** Prompt size scales with
   diff size + linked nodes + PRD section count. For 50+ file PRs
   it lands at $0.20–0.50 per review on Claude. Huge codebases may
   need a chunked-review architecture (per-section prompts).
3. **Brittle hand authoring at team scale.** Multiple authors,
   conflicting edits, drift between perceived architecture and
   actual. Untested on a real team's repo.
4. **Cross-vendor agent consistency.** All `--prompt` mode benches
   used Claude. GPT, Gemini, smaller open models may produce
   different patches on the same prompt.
5. **Structurizr / ADR interop.** A sensible path to broader adoption
   is to plug into the existing architecture-docs world rather than
   replace it.

## References

- Reproducible benchmarks: [`experiments/README.md`](../experiments/README.md)
- PRD layer drift detection (Layer 3 prompt eval): [`experiments/bench-006-prompt-quality/`](../experiments/bench-006-prompt-quality/)
- `pv review --prompt` empirical eval: [`experiments/bench-007-review-quality/`](../experiments/bench-007-review-quality/)
- ADOPTION walkthrough: [`ADOPTION.en.md`](ADOPTION.en.md) / [`ADOPTION.ko.md`](ADOPTION.ko.md)
- Internal architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- PRD layer design: [`PRD-DESIGN.md`](PRD-DESIGN.md)
- PV's own PRD: [`prd/CORE.md`](prd/CORE.md)
