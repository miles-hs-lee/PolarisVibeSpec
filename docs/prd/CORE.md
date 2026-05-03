---
id: PRD-PV-CORE
title: Polaris Vibe Spec — intent layer for AI-era codebases
status: shipped
owner: miles-hs-lee
created: 2026-05-03
updated: 2026-05-03
intents:
  - REQ-PV-001
  - REQ-PV-002
  - REQ-PV-003
  - REQ-PV-004
  - REQ-PV-005
  - REQ-PV-006
  - REQ-PV-007
  - REQ-PV-008
  - REQ-PV-009
  - REQ-PV-010
  - REQ-PV-011
  - REQ-PV-012
  - REQ-PV-013
  - REQ-PV-014
  - REQ-PV-015
  - REQ-PV-016
  - API-PV-PRD-CHECK
  - API-PV-VALIDATE
  - API-PV-HEALTH
  - API-PV-DIFF
  - API-PV-DIAGRAM
  - API-PV-EXPORT-ALL
  - API-PV-RENAME
tags: [thesis, positioning, dogfood]
---

# Polaris Vibe Spec — core PRD

This is the project's own PRD, validated by the project's own
`pv prd check`. The goal of this document is to be the single
canonical answer to "what is PV, why does it exist, what is and
isn't in scope" — readable by a contributor before their first
PR, by a skeptic before adopting it, and by the maintainer six
months from now when they've forgotten why they made a particular
trade-off.

## Problem

Software projects accumulate intent — *why* a function exists, *what*
a service is supposed to do, *who* a workflow is for — that lives
mostly in human memory. In small teams this works: ask the senior
engineer, search Slack, read last quarter's design doc.

That arrangement breaks down on three axes simultaneously:

1. **Time**. Six months later the original author can't reconstruct
   their own decisions from the code alone.
2. **People**. New hires spend weeks ramping; senior departures
   take institutional memory with them.
3. **AI agents**. An agent has no Slack history, no senior to ping,
   no organizational memory. Whatever isn't written down becomes
   hallucination or token-burning grep.

Requirements engineering tools (DOORS, Polarion, Jama) solved a
related problem in regulated industries — aerospace, medical,
automotive — for thirty years, but they're too heavy for general
software development. Agile traded formal requirements for tickets
and Confluence pages, and that worked while the only consumers
were people. AI agents joining the loop changed the calculation.
The cost of keeping intent in human memory was always there; AI
agents itemized the bill on the API invoice.

PV is a small, repo-local intent layer for that gap.

<!-- pv-intents: REQ-PV-001, REQ-PV-015 -->

## Goals

PV must:

- Provide a **single source of truth** for project intent that is
  both git-versionable and machine-readable. Hand-edited prose docs
  drift; PV's `.polaris/graph.json` is structured and validated.
- Generate **human-readable views** automatically — `spec/<id>.md`
  per node, an index, optional Mermaid/Graphviz diagrams. Reviewers
  and new hires read the views; nobody hand-edits them.
- Expose a **drift-detection surface** that a CI run can gate on:
  dangling relations, orphan source files, malformed IDs, deleted
  Intents that PRDs still reference.
- Give an **AI agent a focused file set** for a given change, when
  the right files are encoded in graph relations rather than in
  filenames. The agent reads less defensively, the user pays for
  fewer tokens.
- Be **small enough to adopt on a Tuesday afternoon**. One npm
  install, one `pv bootstrap`, no DB, no daemon, no SaaS account.

<!-- pv-intents: REQ-PV-002, REQ-PV-003, REQ-PV-008, REQ-PV-010, API-PV-DIAGRAM -->

## Non-goals

PV is explicitly **not**:

- A replacement for Notion/Confluence/wikis. PV holds the *intent
  layer*, not the prose-heavy docs that already live there.
- An LLM API consumer. PV emits structured prompts (`pv generate
  --prompt`, `pv enrich --prompt`, `pv prd check --prompt`) that
  the user runs through their own coding agent. PV doesn't manage
  API keys, doesn't pick a model, doesn't pay for tokens.
- A project management tool. No tickets, sprints, approvers,
  burn-down charts. GitHub/Linear/Jira already do that.
- A code generator. Codex/Claude Code do that; PV gives them the
  context to do it well.
- A GUI. PV is a CLI. Diagrams are emitted as Mermaid/Graphviz for
  the user's existing renderer.

<!-- pv-intents: REQ-PV-003, REQ-PV-012, API-PV-PRD-CHECK -->

## User stories

### As a developer, I can ask "what is this file?" in one second.

`pv why src/auth/login.ts` returns every Intent node that claims the
file plus that node's relations. Replaces the "ask Bob" reflex during
code archaeology.

<!-- pv-intents: REQ-PV-015 -->

### As a code reviewer, I can see graph-level changes in PRs.

`pv diff main` reports added/removed/changed nodes and relations,
with breaking-change detection (removed `implements` or `uses`
edges). The output is a paste-able PR comment; CI can gate merges
on `has_breaking`.

<!-- pv-intents: REQ-PV-015 -->

### As an AI agent, I get a focused file set instead of grepping the repo.

`pv impact <id>` returns `{impacted_nodes, impacted_files,
inferred_files, warnings, coverage}`. Asymmetric BFS (depends_on /
implements / uses traversed in reverse, affects forward) keeps the
set tight. The `coverage` field tells the agent whether to trust the
list or also fall back to grep.

`pv ask "<intent>"` is the single-shot preamble: classifies the
intent, queries the graph, runs impact on the top hit, returns
`{recommendation, root, files}` in one call.

<!-- pv-intents: REQ-PV-001, REQ-PV-004, REQ-PV-006, REQ-PV-007, REQ-PV-009 -->

### As a PM, I can confirm my PRD claims still hold in code.

`pv prd check` reads PRD Markdown in `docs/prd/`, finds Intent
references (frontmatter, section directives, body mentions), and
reports drift against `graph.json`. With `--prompt` it emits a
per-section LLM prompt for semantic alignment via the user's agent.

<!-- pv-intents: REQ-PV-016 -->

### As a new hire, I can read the architecture in plain English.

`spec/README.md` is the auto-generated index across domains and node
types. Each node has its own `spec/<id>.md` page with description,
relations, and codemap files. No tribal-knowledge gap on day one.

<!-- pv-intents: REQ-PV-010 -->

### As a maintainer adopting PV on an existing repo, I get a draft graph in one command.

`pv bootstrap --prompt` scans `src/` heuristically, then emits a
prompt for the user's agent to refine semantically. The result is
written to `.polaris/graph.bootstrap.json`; the maintainer reviews
and renames to `graph.json` when satisfied.

`pv promote` lets reviewers edit prose in `spec/<id>.md` (PR diffs
are readable!) and round-trips changes back to `graph.json`,
rejecting structural edits with a clear message pointing at the
right CLI command.

<!-- pv-intents: REQ-PV-011, REQ-PV-013 -->

## Success metrics

PV's value is measured along three axes (in honest order):

1. **Documentation value** — universal. The graph + `spec/` +
   `validate` + `health` + `diff` + `diagram` apply to every
   adopting team regardless of agent use. Self-host evidence:
   PV's own graph has 50 nodes, 0 validate errors, all diagrams
   regenerate cleanly in CI.

2. **Framing value** — agent savings, conditional on task shape.
   bench-002 measured 17–28% cost / 44–47% tool-call savings on
   scoped feature and cross-domain tasks. bench-003 confirmed the
   savings come from the agent reading less defensively when
   structured architecture metadata is present, not from the agent
   actively invoking PV. bench-004 confirmed the effect disappears
   on filename-obvious tasks.

3. **Routing value** — agent savings on cross-domain hidden-link
   tasks specifically. bench-005 measured 15–53% cost / tool-call
   reductions on tasks where the right files are encoded in graph
   relations but **not** in filenames.

The honest framing: documentation value is the constant; framing
and routing value are conditional. Most adopters will keep PV for
the documentation alone. The bench numbers are reproducible in
[`experiments/`](../../experiments/README.md); each bench has its
own `setup-fixture.sh` and `run.sh`.

PV ships a `pv stats` command that aggregates the user's *own*
usage from `.polaris/usage.jsonl` so they can see their own numbers
rather than trusting ours.

<!-- pv-intents: REQ-PV-005, REQ-PV-014, API-PV-VALIDATE, API-PV-HEALTH, API-PV-DIFF, API-PV-DIAGRAM, API-PV-EXPORT-ALL -->

## Out of scope (explicit)

These are decisions, not future bugs:

- **External SaaS integration** — Notion, Confluence, Jira, Linear,
  Aha, Productboard. PV doesn't reach into any API. PRDs that live
  in those systems must be exported to Markdown and committed to
  git first.
- **Non-Markdown PRD formats** — HWP, docx, PDF, Google Docs. Same
  story: convert externally, commit Markdown.
- **Auto-generating PRDs from code** — produces hollow tautologies
  ("the system has a login endpoint"). PRDs are *forward-looking*;
  archaeology of existing code lives in Intent node descriptions.
- **PRD authoring UX** — no editor, no scaffolding beyond what an
  optional template emits. Teams keep their existing PRD writing
  flow.
- **PRD review workflow** — comments, approvers, sign-off, lifecycle
  gates. GitHub PRs already cover this for git-tracked Markdown.
- **LLM-in-PV** — no API key management, no model selection, no
  vendor lock-in. PV emits prompts; the user's agent runs them.
- **Cross-PRD redundancy / conflict detection** — beyond Layer 3's
  per-section prompt, PV doesn't model PRD-to-PRD relationships.
- **Multi-repo intent unification** — one `.polaris/graph.json`
  per repo. Cross-repo intent is an organizational problem this
  tool doesn't try to solve.

<!-- pv-intents: REQ-PV-016 -->

## Open questions

These remain unresolved as of the current ship; the answer will
come from observing actual adoption rather than guessing now.

- **Phase 2 of the PRD layer** — `pv prd template`, `pv prd
  decompose --prompt`, `pv prd lint`, `pv prd link`. Each is
  designed in [`docs/PRD-DESIGN.md`](../PRD-DESIGN.md) but only
  ships when there's evidence Phase 1 isn't enough.
- **Multi-file PRDs (Level 5 of the onboarding gradient)** —
  worth the complexity? Real demand from teams with very large
  PRDs vs theoretical scaling concern.
- **LLM cost ceiling for `--prompt` modes** — should PV warn when
  a prompt exceeds a token threshold (e.g., a 20-section PRD
  generating a megabyte of prompt)?
- ~~**Intent rename UX**~~ — shipped as `pv rename <old> <new>`,
  which updates the graph (node + incoming relations), codemap,
  counters (collision flag + numeric bump), and any PRD frontmatter,
  section directives, or body mentions in one atomic operation.
  Supports `--dry-run` for verification before applying.
- **Health metric thresholds** — `pv health` reports raw numbers.
  Should it eventually warn when a graph is "too sparse" or "too
  dense"? Current stance: leave interpretation to the user.

<!-- pv-intents: API-PV-RENAME, API-PV-HEALTH -->

## Roadmap

What's planned but unscheduled:

- **PRD layer Phase 2** — `template`, `decompose --prompt`, `lint`.
  Triggered by adoption signal (issues asking for it) rather than
  a calendar date.
- **Multi-file PRDs** — natural extension of Phase 2's `decompose`
  if it surfaces patterns where one file is too coarse.
- **Translation pipeline for documentation** — the PRD itself is
  English-source / Korean-derived via GitHub Actions. Pattern may
  extend to ADOPTION/ARCHITECTURE if it works well.
- **Editor integrations** — VS Code extension that highlights
  Intent IDs as links into `spec/<id>.md`. Not core; would be a
  separate package.

What's intentionally *not* roadmapped:

- A web-hosted version of PV. The whole point is git-native.
- A SaaS offering. PV is MIT and shipped via npm; commercial
  derivatives are someone else's project, not this one.

## Why this PRD exists

PV's positioning has shifted twice in its short history — once
when bench-003 found agents don't auto-invoke PV (forcing the
"framing value" reframe), and again when this very document drove
a deliberate articulation of "AI agents itemized the bill."
Without a single canonical PRD, those reframes risked drifting back
into marketing copy that overpromised.

This document is the anchor: when scope-creep tempts a feature,
when a contributor asks "is X a PV concern?", when the maintainer
is six months and ten conversations away from this point in time —
read this. The Intent graph carries the *architecture*; this PRD
carries the *thesis*.
