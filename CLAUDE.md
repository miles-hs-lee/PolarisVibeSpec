# PolarisVibeSpec — agent guide

This repo dogfoods its own product. The `.polaris/graph.json` and
`.polaris/codemap.json` describe **this codebase**, and `pv` (built from
`src/cli.ts`) operates on that graph.

## Build & test

```bash
npm install
npm run build         # → dist/cli.js
node dist/cli.js list # smoke test
```

There's no test suite yet. The `examples/` directory and
`experiments/bench-002/fixtures/multi-domain/` exercise the CLI end to end.

## When to use PV vs grep — empirically derived

Bench-002 (see [experiments/README.md](experiments/README.md)) measured
PV against blind exploration on three task types. The result is **task-shape
dependent**, and the new `pv ask` command encodes this routing for you:

```bash
pv ask "<your intent>"
# returns classification.recommendation: use_pv | use_grep | use_both
```

The classifier rules:

| Detected shape | Recommendation | Empirical basis |
|---|---|---|
| Feature add (`add`, `implement`, `support`…) | `use_pv` | Bench-002 saved 17–28% cost, 44–47% tools |
| Cross-domain feature (≥2 domain keywords) | `use_pv` | Strongest PV win — bench-002 task-2 |
| Pure rename (`rename X to Y`, arrow forms, code-identifier patterns) | `use_grep` | Bench-002 task-3 — PV cost +65%, +44% tools |
| Generic refactor (`refactor`, `move`, `extract`…) | `use_both` | Use PV for scope, grep within those files |
| Anything else | `use_pv` | Default; check `coverage` field — if `global`, prefer grep |

In short: **use PV when "which files matter" is the hard part**, not when
the answer is obvious from a syntactic search. `pv ask` makes that decision
explicit and machine-readable so the agent can route on it.

## Working on the PV codebase itself

Because we self-host, the workflow is:

```bash
pv ask "<your intent>"      # one shot: classifies shape + searches + impact
# → if recommendation = use_pv: read impact.impacted_files only
# → if recommendation = use_grep: skip PV, grep the textual target
# → if recommendation = use_both: PV impact for scope, grep within those files

# Manual fallback if you already know the node id:
pv impact <id>              # also returns coverage: narrow|broad|global
                            #   narrow → trust the file set
                            #   broad  → consider also grepping
                            #   global → root is foundational, expect cascades

npm run build               # rebuild dist/cli.js
pv validate                 # graph integrity check
```

Common entry points:

| You're changing… | Run |
|---|---|
| The asymmetric BFS itself | `pv impact WF-PV-IMPACT` (5 files) |
| Any CLI command's behavior | `pv impact API-PV-<NAME>` |
| Persistence/atomic write | `pv impact WF-PV-PERSIST` |
| The intent compiler heuristic | `pv impact WF-PV-COMPILE` |
| The shared type contract | `pv impact ENT-PV-NODE` (touches almost everything — that's correct) |

After adding a new file, run `pv add-file <node-id> <path>` to keep the
codemap in sync. Run `pv validate` before committing.

## Improvement plan

Six improvement requirements have been added to the graph based on findings
from `experiments/bench-002`:

| ID | What | Why |
|---|---|---|
| [REQ-PV-005](spec/REQ-PV-005.md) | Tooling-level PV-vs-grep guidance | **Done** — see `pv ask` |
| [REQ-PV-006](spec/REQ-PV-006.md) | One-shot preamble (`pv ask`) | **Done** — query+impact in one call |
| [REQ-PV-007](spec/REQ-PV-007.md) | Coverage indicator on impact | **Done** — `narrow`/`broad`/`global` |
| [REQ-PV-008](spec/REQ-PV-008.md) | Codemap orphan/drift detection | Catch stale graphs before they hurt |
| [REQ-PV-009](spec/REQ-PV-009.md) | Compact output mode | Cut narration tokens with `--files-only` |
| [REQ-PV-010](spec/REQ-PV-010.md) | Auto-generated `spec/` | **Done** — `pv export-all` |

`pv impact REQ-PV-006` (or any other) returns the slice an agent should read
to implement that improvement.

## Spec workflow

Human-readable docs live in [`spec/`](spec/) and are auto-generated from the
graph. Never hand-edit files in `spec/` — regenerate them:

```bash
pv export-all                  # → spec/<id>.md per node + spec/README.md index
git diff --quiet spec/         # → 0 if up to date, non-zero if regen drifted
```

When you add or modify nodes in `.polaris/graph.json`, run `pv export-all`
before committing so the spec/ directory stays in sync. A future CI check
should enforce this.

## What this repo isn't

- Not a markdown editor — markdown is a regenerated view, never read back.
- Not an LLM service — `--llm` is a wired flag with a "not configured"
  stub. The compiler is heuristic and offline.
- Not a benchmark harness — that lives under `experiments/` for our own
  validation but isn't a product surface.
