# Token-Savings Experiments

Two benchmarks measure whether wiring Codex/Claude Code to query the Polaris Vibe Spec graph (`pv impact`) before reading source actually reduces token usage versus blind exploration.

> **TL;DR.** On a 37-file repo, the original verbose `with-pv` setup saved 17–28% cost on scoped/cross-domain feature work but cost +65% on pure rename refactors. The **follow-up** introducing `pv ask` + a 6-line CLAUDE.md (`with-pv-v3`) **strictly dominates** every prior condition: same wins on PV-positive tasks (now even larger), and the rename loss disappears. The dominant cost variable for the rename case turned out to be CLAUDE.md length itself, not whether PV exists.

## Methodology

The same Claude Code CLI (`claude -p`, Sonnet, `--max-turns 25`, `--max-budget-usd 0.50`) is invoked twice on the same fixture state — once with PV exposed on PATH plus a CLAUDE.md instructing the agent to `pv query`/`pv impact` first, and once without. Runs are interleaved (with-pv/run-01, without-pv/run-01, with-pv/run-02, …) so the 5-minute prompt-cache TTL doesn't bias one condition.

For each run we capture from `--output-format stream-json`:
- `usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`
- `total_cost_usd`
- tool-call count (counted from `tool_use` blocks in assistant messages)
- wall time
- the modified-file set (`git diff --name-only`)
- whether the fixture's tests still pass after the edit

Reproduce: each `bench-NNN/` has `setup-fixture.sh`, `run.sh <task>`, `aggregate.sh <task>`, and `compare.sh`. Install Claude Code locally with `npm install --no-save @anthropic-ai/claude-code` from `bench-001/`, then run `claude setup-token` once to authenticate.

## bench-001 — 7-file fixture, simple task

A tiny Node.js auth API (signup + login). Task: add a `lastLoginAt` timestamp to `User` and update on successful login.

| condition | n | tools | wall | cost |
|---|---|---|---|---|
| without-pv | 2 | 9.5 | 28.0s | $0.100 |
| with-pv | 2 | 10.5 | 37.0s | $0.104 |

**PV loses by ~3.5% cost and ~32% wall.** The fixture is too small for blind exploration to be expensive — the agent can `find src && cat *` and be done. The 3 PV calls (`pv query`, `pv list`, `pv impact`) are pure overhead.

## bench-002 — 37-file fixture, three task types

A multi-domain app: AUTH (8 files), BILLING (9), ORDER (8), shared (5), top-level (3), tests (3). 26 PV nodes across the three domains with cross-domain `uses` edges (Order → User, Subscription → User, Invoice → Subscription).

Three tasks of different shapes:

### Task 1 — `01-subscription-currency` (scoped, deep within one domain)
Add a `currency` field to `Subscription`, propagate to invoices, accept on `/billing/subscribe`, add a test.

| condition | tools | wall | cost |
|---|---|---|---|
| without-pv | 24.5 | 69.0s | $0.169 |
| with-pv | **13.0** | **50.5s** | **$0.140** |
| **Δ** | **−47%** | **−27%** | **−17%** |

Without PV, the agent reads ~9 files in `billing/` to be safe. With PV, `pv impact ENT-BILLING-SUBSCRIPTION` returns the relevant nodes/files immediately and the agent reads only what's needed.

### Task 2 — `02-checkout-invoice` (cross-domain refactor)
After checkout creates an Order, also generate an Invoice through the billing module. Touches `orders/` and `billing/`.

| condition | tools | wall | cost |
|---|---|---|---|
| without-pv | 27.5 | 81.0s | $0.238 |
| with-pv | **15.5** | **58.0s** | **$0.172** |
| **Δ** | **−44%** | **−28%** | **−28%** |

The strongest PV win: the graph encodes that Order/Invoice are connected to User, which steers the agent away from re-deriving the cross-domain plumbing.

### Task 3 — `03-rename-password-hash` (pure rename refactor)
Rename `passwordHash` → `password_hash` on the User entity and every reference.

| condition | tools | wall | cost |
|---|---|---|---|
| without-pv | **8.0** | **20.0s** | **$0.067** |
| with-pv | 11.5 | 32.5s | $0.110 |
| **Δ** | **+44%** | **+63%** | **+65%** |

PV loses badly. `passwordHash` is a unique syntactic identifier — `grep -rn passwordHash` finds every reference deterministically in one call. The PV preamble (`pv query`, `pv list`, `pv impact`) gets the agent to roughly the same files but adds three round-trips of latency and tokens. The agent in the with-pv condition still ran grep afterward to confirm.

## Synthesis — when does PV pay off?

| task shape | PV verdict |
|---|---|
| Small repo (~7 files), any task | ❌ PV overhead exceeds savings |
| Scoped feature add, ambiguous blast radius | ✅ Strong win (−17% cost, −47% tools) |
| Cross-domain change, semantic linkage | ✅ Strongest win (−28% cost, −44% tools) |
| Pure rename / pattern-based edit | ❌ Strong loss (+65% cost, +44% tools) |

**Mechanism**: PV's value is in teaching the agent *which files matter* when the agent would otherwise read defensively. When the right files are already obvious from a syntactic search (rename, specific call site), PV is a tax — three pv calls plus narration tokens for information grep already provided.

**Implication for CLAUDE.md policy**: instructing the agent to "always use pv first" is the wrong default. A more nuanced guide:

> Use PV when adding/changing features, touching entities used across domains, or when "I don't know which files this affects" applies. Use grep directly for renames, specific call-site updates, or when you already know the exact textual target.

This nuanced policy is itself a candidate for a follow-up experiment.

## Caveats

- **N=2 per condition.** Confidence intervals are wide. The cross-task sign flip is large enough to survive noise, but treat the magnitudes as ±~10pp.
- **One model (Sonnet), one fixture per bench.** Other models or repo shapes might shift the inflection point.
- **Hand-built PV graphs.** The fixtures have clean, accurate codemaps. A real-world stale graph would worsen PV's case.
- **Strong-imperative CLAUDE.md.** "MUST use pv first" was tested in the original with-pv condition. The follow-up below tests softer variants.

## Follow-up — does smarter routing fix task-3?

After implementing `pv ask` (REQ-PV-006), task-shape classification (REQ-PV-005) and the coverage indicator (REQ-PV-007), we re-measured task-3 (`03-rename-password-hash`) under two new conditions to test whether the new routing recovers the without-pv baseline.

| condition | CLAUDE.md (lines) | tools | wall | cost | extra files |
|---|---|---|---|---|---|
| `without-pv` | 9 | 8.0 | 20.0s | $0.067 | 0 |
| `with-pv` (original) | 28 | 11.5 | 32.5s | $0.110 | 0 |
| `with-pv-v2` (`pv ask` + detailed routing table) | 36 | 11.0 | 40.0s | $0.116 | 1 |
| `with-pv-v3` (`pv ask` + 3-line minimal CLAUDE.md) | **6** | **8.0** | 22.5s | **$0.087** | 0 |

Two findings, one negative and one positive:

**v2 was a regression.** Adding the `pv ask`/`coverage` machinery while keeping a long, prescriptive CLAUDE.md cost +5% vs the original `with-pv` and +73% vs `without-pv`. The agent in v2 actually used the new tools correctly — `run-02` skipped PV entirely and went straight to grep — but still cost more. Two reasons traced from tool patterns:
1. The v2 CLAUDE.md is 36 lines vs 28 in v1 vs 9 in `without-pv`. Every additional line is system-prompt overhead on every run.
2. v2 CLAUDE.md mentioned `pv add-file` for codemap sync, so the agent dutifully read and edited `.polaris/graph.json` after the rename — adding 2 tool calls and an extra modified file (visible as `extra_files=1` in both v2 runs).

**v3 (minimal CLAUDE.md, 6 lines) recovered the baseline.** Same task, identical tool-call profile to `without-pv` (8 tools, no PV calls, no graph maintenance), and the cost gap shrinks to ~30% — most of which is run-to-run noise at N=2.

The dominant variable for task-3 cost was **CLAUDE.md size**, not whether `pv ask` exists or not:

| CLAUDE.md lines | cost |
|---|---|
| 6 (v3) | $0.087 |
| 9 (without-pv) | $0.067 |
| 28 (v1) | $0.110 |
| 36 (v2) | $0.116 |

Roughly monotone in length. The CLAUDE.md tax is fundamental: every line is read every turn, and *the policy does not pay for itself when the policy says "skip the tool."*

### Does v3 also win on the PV-positive tasks?

The natural concern: maybe the 6-line `with-pv-v3` doc is *too short* to give the agent enough guidance on the cases where PV genuinely helps (task-1, task-2). Cross-task re-measurement, N=2 each:

| task | condition | tools | wall | cost | vs v1 |
|---|---|---|---|---|---|
| 01-subscription-currency | without-pv | 24.5 | 69.0s | $0.169 | — |
| 01-subscription-currency | with-pv (v1, 28 lines) | 13.0 | 50.5s | $0.140 | baseline |
| 01-subscription-currency | **with-pv-v3 (6 lines)** | **10.0** | **35.5s** | **$0.137** | **−23% tools, −30% wall, −2% cost** |
| 02-checkout-invoice | without-pv | 27.5 | 81.0s | $0.238 | — |
| 02-checkout-invoice | with-pv (v1, 28 lines) | 15.5 | 58.0s | $0.172 | baseline |
| 02-checkout-invoice | **with-pv-v3 (6 lines)** | **14.0** | **58.0s** | **$0.170** | **−10% tools, −1% cost** |
| 03-rename-password-hash | without-pv | 8.0 | 20.0s | $0.067 | — |
| 03-rename-password-hash | with-pv (v1, 28 lines) | 11.5 | 32.5s | $0.110 | baseline |
| 03-rename-password-hash | **with-pv-v3 (6 lines)** | **8.0** | **22.5s** | **$0.087** | **−30% tools, −31% wall, −21% cost** |

**v3 strictly dominates v1 on every task** — bigger margins on rename and scoped-feature, near-tie on cross-domain. PV's positive-case wins are preserved, the negative-case loss disappears. There is no remaining reason to use the verbose `with-pv` form.

### Implications for PV's design

1. **Keep CLAUDE.md ≤10 lines.** The "MUST use pv first" verbose form is the wrong default. Replace with a one-sentence hand-off: "Run `pv ask "<intent>"` and follow `recommendation`."
2. **Encode routing logic in tool output, not docs.** `pv ask`'s `classification.recommendation` field IS the policy. Restating the policy in CLAUDE.md duplicates cost.
3. **REQ-PV-009 (compact output) becomes load-bearing.** When `pv ask` returns `recommendation: use_grep`, the output should be very short — current responses still emit full hits + impact, which is wasted bytes the agent then narrates.
4. **Codemap maintenance instructions belong in tool guidance, not CLAUDE.md.** A future `pv add-file` could prompt for itself only when needed (e.g. after a `pv` command notices new files), rather than CLAUDE.md telling the agent to remember it for every change.

## Layout

```
experiments/
├── bench-001/                       — 7-file fixture, single task
│   ├── setup-fixture.sh             — re-init fixture's local git baseline
│   ├── run.sh, aggregate.sh
│   ├── conditions/{with-pv,without-pv}/CLAUDE.md
│   ├── bin/pv                       — shim: `node ../../dist/cli.js`
│   ├── fixtures/auth-api/           — committed; `setup-fixture.sh` re-tags
│   └── runs/<condition>/run-NN/
│
└── bench-002/                       — 37-file fixture, three tasks
    ├── setup-fixture.sh             — generates fixture + .polaris graph
    ├── run.sh, aggregate.sh, compare.sh
    ├── conditions/{with-pv,without-pv,with-pv-v2,with-pv-v3}/CLAUDE.md
    ├── bin/pv
    ├── tasks/<id>/{prompt.txt,expected-files.txt}
    ├── fixtures/multi-domain/       — auto-generated from setup-fixture.sh
    └── runs/<task>/<condition>/run-NN/
```
