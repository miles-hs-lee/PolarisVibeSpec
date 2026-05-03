# Polaris Vibe Spec

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![CI](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml/badge.svg)](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml)

> An intent layer for your codebase that both humans and AI agents can read.
>
> **Graph = memory · Markdown = view · CLI = control surface.**

## What it is

Polaris Vibe Spec (`pv`) is a small, hand-authored graph of your
project's *intent* — requirements, APIs, workflows, entities — paired
with a map from each node to the source files that implement it. Think
of it as a living architecture document that:

- **Stays in sync with code** — `pv validate` flags drift; `pv export-all`
  regenerates a human-readable `spec/` directory; `pv promote` lets
  reviewers edit prose in markdown and round-trip back to JSON.
- **Doubles as agent routing** — `pv ask` and `pv impact` give an AI
  coding agent the file set to focus on for a given change, when the
  graph encodes a connection that filenames don't reveal.

It's a local TypeScript CLI. No DB, no network, no LLM calls inside the
tool itself — when LLM-shaped work helps, `pv` emits a prompt your
agent runs with its own tools.

The primary value is the *spec* — a structured architecture record
that survives the lifetime of the project. The agent benefits are
real but task-shape dependent ([data below](#three-sources-of-value-be-honest-about-which-apply-to-you));
the documentation value applies regardless of which agent you use,
or whether you use one at all.

## Three sources of value (be honest about which apply to you)

After five benches we have separate empirical anchors for each axis.
The honest order — what most users will benefit from first — is:

### 1. Documentation — applies to every repo with a graph

Independent of agent behavior:

- `pv export-all` generates a `spec/<id>.md` per node + a domain index.
  PR diffs show graph changes in human-readable form.
- `pv validate` catches drift (orphan source files, dangling relations,
  duplicate ids). Wire it into CI for free continuous architecture review.
- `pv promote` lets reviewers edit prose in `spec/*.md` and applies
  safe (title/tags/description) changes back to `graph.json`. Structural
  changes (id/type/relations) are rejected with a pointer to the right
  tool.
- The graph is the single source of truth. New team members read
  `spec/README.md` for the index instead of guessing from the file tree.

This is the value most users will keep regardless of which agent
they use, or whether they use one at all.

### 2. Framing — when applicable, free agent savings

Just having `.polaris/graph.json` plus a 6-line CLAUDE.md noting the
repo has structured architecture metadata makes the agent **less
defensive** on the right task shapes. From bench-002 (37-file fixture,
Sonnet, N=2):

| Task | Tools (Δ) | Cost (Δ) | Wall (Δ) |
|---|---|---|---|
| Add a field to an entity | **−47%** | **−17%** | **−27%** |
| Cross-domain refactor | **−44%** | **−28%** | **−28%** |
| Pure rename (caught by classifier) | matches grep baseline | matches | matches |

These savings don't depend on the agent invoking `pv ask`; bench-003
tool patterns showed the agent often skips PV calls entirely and just
reads fewer files because it trusts the architecture is clean.
Caveat: bench-004 found the framing effect is *task-dependent* — on
filename-obvious tasks at scale, the agent is already efficient and
PV adds nothing.

### 3. Routing tools — confirmed for cross-domain hidden links

`pv ask` classifies an intent (`use_pv` / `use_grep` / `use_both`) and
runs `pv impact` on the top hit. When the task involves a connection
that lives in graph relations but **not in filenames**,
[`bench-005`](experiments/bench-005/README.md) measured directly:
−53% tools, −21% wall, −15% cost (Sonnet, 86-file fixture, N=2,
coerced `pv ask`). The agent in the v3 condition voluntarily invoked
`pv ask` in 1 of 2 runs on this task — the first organic PV usage
across five benches.

The catch: on tasks whose right files are obvious from filenames, the
same coerced PV invocation is overhead (bench-004: +1 tool, +42% wall,
+7% cost). The classifier and `coverage` field exist to route those
cases away from PV automatically.

This value is *real but conditional*: it shows up only when the graph
encodes connections that filenames don't, AND the task touches them.
That's a real but bounded subset of everyday work — see
[`docs/POSITIONING.md`](docs/POSITIONING.md) for how this shaped the
project's framing.

Full data: [`experiments/README.md`](experiments/README.md).

## 30-second start

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build && npm link    # exposes `pv` globally

# In your own repo:
cd /path/to/your-repo
pv bootstrap --prompt        # scaffolds .polaris/graph.bootstrap.json from src/

# Before any code change:
pv ask "Add lastLoginAt to User" --minimal
# → returns {recommendation, files} so your agent reads only what matters
```

For a full walkthrough see **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)**
([한국어](docs/ADOPTION.ko.md)).

## Usage in 4 commands

```bash
# 1. Set up the graph (once per repo)
pv bootstrap --prompt        # heuristic scan + a prompt your agent refines

# 2. Before any code change
pv ask "<your intent>" --minimal
# follow classification.recommendation: use_pv | use_grep | use_both

# 3. After changes that add or modify spec nodes
pv export-all                # regenerate human-readable spec/<id>.md

# 4. To validate
pv validate                  # dangling relations, dup ids, orphan source files
```

There are 16 commands total. `pv --help` shows them; the auto-generated
[`spec/`](spec/) directory in this repo documents each one as a node
(meta — the tool describes itself).

## Wiring to your agent

The bundled [Claude Code skill](skills/pv/SKILL.md) is the recommended
path — copy `skills/pv/` to `.claude/skills/pv/` in your project. Skills
load only when triggered, so they don't tax every turn the way a long
`CLAUDE.md` would. For other agents, point them at the same one-line
rule: *run `pv ask "<intent>"` first, follow the `recommendation` it
returns.*

The bench-002 follow-up showed instructions to the agent should be kept
**very short** — long policy text in `CLAUDE.md` itself dominated the
rename-task cost more than any tool choice did. The skill keeps the
instruction visible only when needed.

## Documentation

- **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)** / **[ko](docs/ADOPTION.ko.md)** — full walkthrough for adopting `pv` on an existing repo.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — internal design (asymmetric traversal, ID format, classifier rules, layout).
- **[experiments/README.md](experiments/README.md)** — reproducible benchmarks; the empirical basis for every design choice.
- **[spec/](spec/)** — auto-generated specification of `pv` itself (this repo dogfoods).
- **[CHANGELOG.md](CHANGELOG.md)** · **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** · **[SECURITY.md](SECURITY.md)**

## Limitations

What we measured well, and what we didn't:

- **Token / wall-time savings** are real on the well-fitting task shapes
  above. Per-turn savings are small (~$0.05, a few seconds); the
  cumulative gain over a week of agent-driven work is what matters.
  `pv stats` aggregates your own usage from `.polaris/usage.jsonl` so you
  can see your own numbers.

- **Correctness when the graph is stale was NOT measured in bench-001/002.**
  Both fixtures had hand-curated, perfectly-accurate codemaps. Real
  repos drift: a new file gets added but `pv add-file` is skipped; a
  relation becomes obsolete after a refactor; the graph is months
  behind the code. PV will then point the agent at *the wrong* files
  with high confidence. `pv validate` catches some drift (orphan source
  files, dangling relation targets), but not all (e.g., a relation that
  should exist but doesn't). `experiments/bench-003/` measures the cost
  of stale state directly.

- **Maintenance overhead.** Every new source file should get a `pv add-file`;
  every graph edit should be followed by `pv export-all`. CI catches
  spec drift but not codemap drift. Budget ~30 seconds per code-change
  PR; if your team does many small PRs this adds up and may erase the
  per-task savings.

- **Confidence inflation.** A `narrow` coverage signal nudges the agent
  to trust the file set without grep-cross-checking. If the graph is
  *narrowly wrong* (missing one related file), the agent will produce a
  partial fix and tests-pass-but-actually-broken behavior is possible.
  The `coverage: global` escape hatch helps for foundational types but
  not for narrow-but-stale relations.

The ADOPTION guide includes a "Maintenance" section with the same
information for users adopting PV on a real repo.

## License

[MIT](LICENSE).
