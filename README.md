# Polaris Vibe Spec

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![CI](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml/badge.svg)](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml)

> A repo-local intent traceability checker for AI-era codebases.
>
> **Catches code changes that have drifted from documented intent — at PR time, in CI.**

## What it is

Polaris Vibe Spec (`pv`) is a small, hand-authored graph of your
project's intent — requirements, APIs, workflows, entities — paired
with a map from each node to the source files that implement it. It
treats intent as a first-class artifact you can query, diff, and
validate alongside the code.

The headline use case: **at PR time, surface code changes that have
drifted from the intent layer.** A new file with no codemap link.
A modified function whose linked Intent description no longer
matches the behavior. A PRD section that contradicts the code.
`pv changed` catches the structural drift; `pv review --prompt`
catches the semantic drift via your coding agent.

It's a local TypeScript CLI. No DB, no network, no LLM calls inside
the tool itself — when LLM-shaped work helps, `pv` emits a prompt
your agent runs with its own tools.

## Why now

Requirements management is an old field — DOORS, Polarion, Jama
have served regulated industries (aerospace, medical, automotive)
for 30+ years. General software development never adopted the
discipline at scale: agile traded formal requirements for tickets
and Confluence pages, and that worked while the only consumers of
intent were people.

AI coding agents change the calculation. An agent has no Slack
history, no senior engineer to ping, no organizational memory.
Whatever isn't written down becomes hallucination or
token-burning exploration. The cost of keeping intent in human
memory was always there; AI agents make it visible.

PV is what happens when you take the architecture-memory discipline
that worked in regulated industries, strip it down to a CLI +
git-tracked JSON + auto-generated Markdown, and aim it at a repo
whose consumers now include both humans and agents.

## 30-second start

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build && npm link    # exposes `pv` globally

# In your own repo, scaffold the graph from existing src/:
cd /path/to/your-repo
pv bootstrap --prompt
# review the draft, then rename to .polaris/graph.json when satisfied.

# At PR time, run the drift gate:
pv changed origin/main
# returns structural findings (orphan files, broken codemap, linked
# Intents whose PRDs may need updates). Exits 1 if anything needs
# attention so CI can gate the PR.

# For semantic review, hand the prompt to your coding agent:
pv review origin/main --prompt > /tmp/review.md
# paste /tmp/review.md into Claude Code, Codex, etc.
```

For a full walkthrough see **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)**
([한국어](docs/ADOPTION.ko.md)).

## What you get

### 1. Intent drift gate at PR time

`pv changed [<base>]` joins `git diff` against the codemap and PRDs
to surface structural drift:

- **orphan_added** (warn) — new source file not linked to any Intent
- **broken_codemap** (error) — codemap still references a removed file
- **rename_codemap** (error) — file renamed, codemap kept old path
- **linked_node** (info) — change touches an Intent's linked files;
  PRD sections referencing it may need updates too

Exits 0 on info-only or empty diff; exits 1 on warn/error so CI can
gate PRs.

`pv review [<base>] --prompt` is the semantic companion. Same diff,
but emits a structured Markdown prompt for your coding agent to
identify:

- Intent descriptions that the behavior change has made stale
- New Intent nodes that should exist for newly-shipped capabilities
- PRD sections that now contradict the code
- Codemap links to add or remove

PV doesn't call the LLM — your agent reviews, you apply the
proposed patches via existing graph-mutation commands (`pv generate`,
`pv link`, `pv promote`, `pv add-file`). Empirical basis:
[`experiments/bench-007-review-quality/`](experiments/bench-007-review-quality/)
measured 4/4 hits on planted-drift scenarios with 0/4 false
positives on the aligned control.

### 2. Living architecture documentation

Independent of any agent:

- `pv export-all` generates a `spec/<id>.md` per node + a domain
  index. PR diffs show graph changes in human-readable form.
- `pv validate` catches dangling relations, duplicate ids, orphan
  source files. Wire into CI for free continuous architecture
  review.
- `pv promote` lets reviewers edit prose in `spec/*.md` and
  round-trips safe (title/tags/description) changes back to
  `graph.json`. Structural changes are rejected with a pointer to
  the right command.
- `pv diagram` emits Mermaid or Graphviz of the whole graph or a
  focused subgraph.
- `pv why <path>` answers "what does this file implement?" in one
  command — the most direct daily benefit during code review.

### 3. Focused context for AI agents

When an AI agent makes changes:

- `pv impact <id>` returns the focused file set affected by a change
  to a node — explicit codemap files plus inferred files, with a
  `coverage` indicator so the agent knows whether to trust the set
  or also grep.
- `pv prd check` validates PRD references against the graph;
  `--prompt` mode emits a per-section semantic alignment prompt for
  the agent.
- The graph is exposed via the same CLI a developer uses — no
  separate API. The bundled [Claude Code skill](skills/pv/SKILL.md)
  loads only when triggered, so it doesn't tax every turn.

## Daily commands

```bash
# Set up once per repo
pv bootstrap --prompt        # scan src/ + agent-refined draft

# After editing the graph or codemap
pv export-all                # regenerate spec/<id>.md per node
pv validate                  # graph integrity (CI-friendly)
pv health                    # quality metrics (codemap coverage, density)

# At PR time (or in CI)
pv changed origin/main       # structural drift gate; exits 1 on issues
pv review origin/main --prompt | <your agent>   # semantic review

# Code review aids
pv why src/path/to/file.ts   # which nodes claim this file?
pv diff main                 # graph-level diff vs base ref
pv diagram --node <id> -f mermaid

# When the graph itself changes
pv generate "<intent>"       # add a node from natural-language intent
pv link <fromId> <toId> <relation>
pv add-file <id> <path>
pv rename <oldId> <newId>    # atomic rename across graph + codemap + PRDs
pv promote                   # apply spec/*.md prose edits back to graph
```

`pv --help` shows the full set; the auto-generated [`spec/`](spec/)
directory in this repo documents each command as a node — the tool
describes itself.

## Documentation

- **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)** / **[ko](docs/ADOPTION.ko.md)** — full walkthrough for adopting `pv` on an existing repo.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** ([한국어](docs/ARCHITECTURE.ko.md)) — internal design (asymmetric traversal, drift detection, ID format, layout).
- **[docs/PRD-DESIGN.md](docs/PRD-DESIGN.md)** ([한국어](docs/PRD-DESIGN.ko.md)) — PRD layer design and `pv prd check`.
- **[docs/POSITIONING.md](docs/POSITIONING.md)** — how PV relates to Structurizr / C4 / ADRs / Sourcegraph / Graphify / etc.
- **[docs/prd/CORE.md](docs/prd/CORE.md)** ([한국어](docs/prd/CORE.ko.md)) — PV's own PRD (this project dogfoods).
- **[experiments/README.md](experiments/README.md)** — reproducible benchmarks; empirical basis for design choices.
- **[spec/](spec/)** — auto-generated specification of `pv` itself.
- **[CHANGELOG.md](CHANGELOG.md)** · **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** · **[SECURITY.md](SECURITY.md)**

## How it relates to other tools

The closest cousin is **[Structurizr](https://structurizr.com/)** —
both encode architecture as code, both treat intent as a first-class
artifact, both produce a graph of relationships. Where Structurizr
is optimized for humans browsing diagrams (System Context →
Container → Component, multiple views, rich layout), PV exposes the
same intent layer to **two consumers at once**:

- **Humans** — `pv export-all` writes `spec/<id>.md`; `pv diagram`
  emits Mermaid/Graphviz; PR diffs read in plain English.
- **AI coding agents** — `pv impact` / `pv why` / `pv changed` /
  `pv review` give an agent a graph it can query, plus structural
  and semantic drift gates that fire when its changes diverge.

Compared to **structural code-graph tools** (Sourcegraph, Glean,
code navigation): those auto-extract from code (imports, calls,
types). PV captures the *opposite* — hand-authored intent that the
code *implements*. Most teams want both; the structural tools answer
"what calls this?", PV answers "why does this exist?".

If you use **ADRs**, PV sits below them: ADRs record decisions, PV
records the architecture those decisions shape. PV doesn't replace
either Structurizr or ADRs — it's the missing intent layer that
makes both queryable by AI coding agents.

See [`docs/POSITIONING.md`](docs/POSITIONING.md) for the full
landscape comparison.

## Who this is for (and isn't)

PV pays off when:

- Multiple people will read the codebase over multiple quarters
- AI agents are part of the development loop and you want their
  changes traceable to intent
- You already write PRDs (or want to), and want them validated
  against the code
- Your domain has multiple sub-areas (auth, billing, notifications,
  …) where cross-domain relationships are encoded in the graph but
  not in filenames

PV is overhead when:

- 1-2 people on a 1-3 month project
- Single domain, all logic in one or two files
- You don't write PRDs and don't plan to
- The codebase is small enough that anyone can hold it in their head

## Limitations

- **Maintenance has a cost.** Every new source file should get a
  `pv add-file`; every graph edit should be followed by
  `pv export-all`. `pv changed` catches missed codemap entries at
  PR time, but the maintenance is real. Budget ~30 seconds per
  code-change PR.

- **Drift over time.** A graph hand-authored today is fresh; six
  months later, real repos drift. `pv validate` and `pv changed`
  catch structural drift; `pv review --prompt` catches some
  semantic drift but is non-deterministic — same prompt through
  different agents may produce different patches. PV is not the
  authority — the user reviews each proposal before applying.

- **Per-PR cost of `pv review --prompt` scales with diff size.**
  Typical small PRs (3–10 files) land at ~$0.03–0.07 per review on
  Claude. Very large PRs (50+ files) can hit $0.20–0.50; for huge
  codebases, run `pv changed` on every PR and reserve `pv review`
  for substantial behavior changes.

- **Layer 3 catches what's in its context.** The semantic-review
  prompt sees linked Intents + their 1-hop neighbors + linked PRD
  sections. An Intent that *should* be linked but isn't can fall
  outside the agent's view. The structural side (`pv changed`)
  catches the missing link itself.

The ADOPTION guide includes a "Known limitations" section for users
adopting PV on a real repo.

## License

[MIT](LICENSE).
