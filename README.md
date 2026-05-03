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

## Why now

Requirements management is an old field — DOORS, Polarion, Jama have
served regulated industries (aerospace, medical, automotive) for 30+
years. General software development never adopted the discipline at
scale: agile traded formal requirements for user-story tickets and
Confluence pages, and that worked because intent could live in
people's heads, in Slack history, in the senior engineer who's been
here three years.

AI coding agents broke that arrangement. The agent doesn't have a
Slack account, doesn't remember last quarter's design doc, and can't
ping the senior engineer. Whatever isn't written down becomes either
hallucination or a token-burning grep storm — both visible on the
API bill in a way that human ramp-up cost never was. The cost of
keeping intent in human memory was always there; it just wasn't
itemized.

PV is what happens when you take the architecture-memory discipline
that worked in regulated industries, strip it down to a CLI + git-
tracked JSON + auto-generated Markdown, and aim it at a repo whose
consumers now include both humans and agents. Small enough to adopt
on a Tuesday afternoon, structured enough that an agent can query it.

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

### 2. Framing — agent savings, when applicable

Having `.polaris/graph.json` plus a short CLAUDE.md noting the repo has
structured architecture metadata makes an AI agent read less defensively
on the right task shapes. Bench-002 measured cost / tool savings in the
17–28% range on scoped feature and cross-domain refactor tasks; rename
refactors caught by the classifier match the grep baseline. The savings
don't require the agent to invoke `pv ask` — they come from the agent
trusting the architecture is structured. Caveat: bench-004 found the
effect is task-dependent and disappears on filename-obvious tasks where
the agent is already efficient.

### 3. Routing — agent savings on cross-domain hidden links

`pv ask` classifies an intent and runs `pv impact` on the top hit. On
tasks whose right files are encoded in graph relations but **not** in
filenames, bench-005 measured cost / tool savings in the 15–53% range.
On tasks with obvious filenames, coerced `pv ask` is overhead (the
classifier exists to route those cases to grep automatically).

Full empirical data and methodology: [`experiments/README.md`](experiments/README.md).
For how the bench results shaped this framing, see
[`docs/POSITIONING.md`](docs/POSITIONING.md).

## 30-second start

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build && npm link    # exposes `pv` globally

# In your own repo:
cd /path/to/your-repo
pv bootstrap --prompt        # scaffold .polaris/graph.bootstrap.json from src/
# review and rename to .polaris/graph.json when satisfied.

# Daily, after editing the graph or codemap:
pv export-all                # regenerate spec/<id>.md per node + index
pv validate                  # graph integrity check (CI-friendly)

# During code review:
pv why src/auth/login.ts     # what node(s) does this file implement?
pv diagram --node ENT-AUTH-USER --depth 2 -f mermaid > arch.mmd
```

For a full walkthrough see **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)**
([한국어](docs/ADOPTION.ko.md)).

## Daily usage

```bash
# Set up the graph (once per repo)
pv bootstrap --prompt        # heuristic scan + a prompt your agent refines

# Documentation workflow (daily — these are the universal-value commands)
pv export-all                # regenerate human-readable spec/<id>.md per node
pv validate                  # graph integrity (dangling relations, dup ids, orphans)
pv health                    # graph quality metrics (codemap coverage, density)

# Code review aids
pv why src/path/to/file.ts   # which nodes claim this file?
pv diff main                 # graph-level diff vs base ref (paste into PR)
pv diagram --node <id> -f mermaid

# Optional: agent integration
pv ask "<your intent>" --minimal
# follow classification.recommendation: use_pv | use_grep | use_both
```

There are 20 commands total. `pv --help` shows them; the auto-generated
[`spec/`](spec/) directory in this repo documents each one as a node
(meta — the tool describes itself).

## Optional: AI agent integration

If you do use an AI coding agent and want the framing/routing benefits
described above, the bundled [Claude Code skill](skills/pv/SKILL.md)
is the lightest way to wire it: copy `skills/pv/` to `.claude/skills/pv/`
in your project. Skills load only when triggered, so they don't tax
every turn. For other agents, point them at the same one-line rule:
*run `pv ask "<intent>"` first, follow the `recommendation` it returns.*

A bench-002 follow-up found that long policy text in `CLAUDE.md` itself
dominated rename-task cost more than any tool choice did, so the skill
keeps the instruction visible only when needed. **This whole section is
skippable if you only want PV's documentation value** — the graph,
`spec/`, validate, diagram, and PR-diff all work without any agent in
the loop.

## Documentation

- **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)** / **[ko](docs/ADOPTION.ko.md)** — full walkthrough for adopting `pv` on an existing repo.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** ([한국어](docs/ARCHITECTURE.ko.md)) — internal design (asymmetric traversal, ID format, classifier rules, layout).
- **[experiments/README.md](experiments/README.md)** — reproducible benchmarks; the empirical basis for every design choice.
- **[spec/](spec/)** — auto-generated specification of `pv` itself (this repo dogfoods).
- **[CHANGELOG.md](CHANGELOG.md)** · **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** · **[SECURITY.md](SECURITY.md)**

## How it relates to Structurizr / C4 / ADRs

The closest spirit cousin is **[Structurizr](https://structurizr.com/)** —
both encode architecture as code, both treat intent as a first-class
artifact, both produce a graph of relationships. Where Structurizr is
optimized for humans browsing diagrams (System Context → Container →
Component, multiple views, rich layout), PV exposes the same intent
layer to **two consumers at once**:

- **Humans** — `pv export-all` writes a `spec/<id>.md` per node;
  `pv diagram` emits Mermaid/Graphviz; PR diffs read in plain English.
- **AI coding agents** — `pv impact` / `pv ask` / `pv why` give the
  agent a graph it can query before it edits.

If you already use Structurizr DSL or the C4 model, you can think of
PV as "the same intent layer, also queryable by an agent." If you use
ADRs (`docs/adr/`), PV is one level above — ADRs record decisions,
PV records the architecture those decisions shape. PV doesn't try to
replace either; it occupies the space between architecture-as-code
and agent-aware code search.

See [`docs/POSITIONING.md`](docs/POSITIONING.md) for the full landscape
comparison, including OpenAPI/GraphQL, Bazel BUILD files, CODEOWNERS,
and `.cursorrules`/skill-style agent steering.

## Limitations

What we measured well, and what we didn't:

- **Maintenance overhead.** Every new source file should get a
  `pv add-file`; every graph edit should be followed by `pv export-all`
  (and `pv diagrams` if you embed diagrams in docs). CI catches spec and
  diagram drift but not codemap drift. Budget ~30 seconds per code-change
  PR.

- **Drift over time.** A graph hand-authored today is fresh; six months
  later, real repos drift — a new file is added without `pv add-file`,
  a relation becomes obsolete after a refactor, the graph falls behind
  the code. `pv validate` catches some drift (orphan source files,
  dangling relation targets), but not all (e.g., a relation that should
  exist but doesn't). `experiments/bench-003/` measures the cost of
  stale state directly.

- **Confidence inflation.** A `narrow` coverage signal nudges the agent
  to trust the file set without grep-cross-checking. If the graph is
  *narrowly wrong* (missing one related file), the agent can produce a
  partial fix where tests pass but behavior is still broken. The
  `coverage: global` escape hatch helps for foundational types but not
  for narrow-but-stale relations.

- **Agent token / wall-time savings are conditional.** When they apply,
  per-turn savings are small (~$0.05, a few seconds); the cumulative
  gain over a week of agent-driven work is what matters. `pv stats`
  aggregates your own usage from `.polaris/usage.jsonl` so you can see
  your own numbers. The savings vanish on tasks where filenames already
  reveal the right files (most renames, scoped bug fixes).

The ADOPTION guide includes a "Known limitations" section with the same
information for users adopting PV on a real repo.

## License

[MIT](LICENSE).
