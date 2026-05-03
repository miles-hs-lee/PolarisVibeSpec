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
dependent**:

| Task shape | What to do |
|---|---|
| Adding a feature, field, or API; cross-domain change; "I don't know which files this affects" | **`pv query` → `pv impact <id>` first.** Read only the listed files. PV saved 17–28% cost and 44–47% tool calls in bench-002. |
| Pure rename (e.g. `passwordHash` → `password_hash`); specific call-site update with a known textual target | **Use `grep` directly.** Bench-002 task-3 showed PV adds +44% tool calls and +65% cost when grep already gives a deterministic answer. |
| Tiny repo (<10 files), any task | **Skip PV.** Bench-001 showed the 3-call PV preamble exceeds savings at this scale. |

In short: **use PV when "which files matter" is the hard part**, not when
the answer is obvious from a syntactic search.

## Working on the PV codebase itself

Because we self-host, the workflow is:

```bash
pv query "<thing you're changing>"
pv impact <id>          # returns the files to read/edit
# edit those files only
npm run build           # rebuild dist/cli.js
node dist/cli.js validate   # graph integrity check
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
| [REQ-PV-005](spec/REQ-PV-005.md) | Tooling-level PV-vs-grep guidance | Docs-only mitigation is fragile |
| [REQ-PV-006](spec/REQ-PV-006.md) | One-shot preamble (`pv ask`) | 3 calls today, can be 1 |
| [REQ-PV-007](spec/REQ-PV-007.md) | Coverage indicator on impact | Agents can't tell narrow vs broad sets |
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
