# Polaris Vibe Spec

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![CI](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml/badge.svg)](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml)

> A spec-driven coding layer between your repo and any AI coding agent —
> Claude Code, Codex, Cursor, custom agents.
>
> **Graph = memory · Markdown = view · CLI = control surface.**

## What it is

Polaris Vibe Spec (`pv`) keeps a small, hand-authored graph of your
project's *intent* — requirements, APIs, workflows, entities — alongside
a map from each node to the source files that implement it. When an
agent is about to make a code change, one CLI call returns the precise
file set that the change will touch. The agent reads those files
instead of grepping the whole repo.

It's a local TypeScript CLI. No DB, no network, no LLM calls inside the
tool itself — when LLM-shaped work helps, `pv` emits a prompt your agent
runs with its own tools.

## Why it pays off (and when it doesn't)

Measured on a 37-file fixture across three task shapes (Sonnet, headless,
N=2):

| Task | Tools (Δ) | Cost (Δ) | Wall (Δ) |
|---|---|---|---|
| Add a field to an entity (scoped, deep) | **−47%** | **−17%** | **−27%** |
| Cross-domain refactor (Order → Billing) | **−44%** | **−28%** | **−28%** |
| Pure rename (`fooBar` → `foo_bar`) | +44% | +65% | +63% |

The win is when the agent would otherwise read defensively across many
files. The loss is when grep already gives a deterministic answer (renames
and pattern substitutions). `pv ask` classifies the request and tells the
agent which path to take, so the loss case is avoided automatically.

Full data and methodology: [`experiments/README.md`](experiments/README.md).

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

## License

[MIT](LICENSE).
