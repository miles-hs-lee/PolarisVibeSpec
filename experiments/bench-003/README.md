# bench-003 — drift safety (the experiment that broke our story)

## What we set out to measure

Bench-002 measured token / wall savings with a *clean* graph. The natural follow-up: how does PV behave when the graph is *stale*? A real-world repo will drift — files added without `pv add-file`, relations going obsolete after a refactor, the graph months behind the code.

Hypothesis: with a stale graph, `pv ask` returns a confidently *wrong* file set. The agent edits those files, misses the real one, tests fail.

Setup: same multi-domain fixture and `01-subscription-currency` task as bench-002. Four scenarios layered drift onto the `.polaris/{graph,codemap}.json`:

- **A — clean** (control; matches bench-002 with-pv-v3 task-1)
- **B — stale codemap**: `API-BILLING-SUBSCRIBE` codemap rewritten to NOT include `subscribe.js`; bogus `legacy_old.js` added to `ENT-BILLING-SUBSCRIPTION`.
- **C — stale relations**: the `API-BILLING-SUBSCRIBE → ENT-BILLING-SUBSCRIPTION uses` edge removed, so impact-of(ENT-BILLING-SUBSCRIPTION) no longer reaches the API.
- **D — multi-drift**: B + C + invoice codemap also wrong.

Same `with-pv-v3` minimal CLAUDE.md ("run `pv ask` first"). N=2 per scenario.

## What actually happened

| scenario | tests_ok | avg_missing_required | avg_tools | avg_cost | avg_wall |
|---|---|---|---|---|---|
| A-clean | 2/2 | 0.00 | 10.0 | $0.151 | 41.0s |
| B-stale-codemap | 2/2 | 0.00 | 10.0 | $0.141 | 42.0s |
| C-stale-relations | 2/2 | 0.00 | 10.0 | $0.144 | 41.5s |
| D-multi-drift | 2/2 | 0.00 | 10.0 | $0.132 | 108.0s |

**Drift had zero measurable correctness impact.** All 8 runs passed all three test suites; all 8 runs edited exactly the 4 required files. The hypothesis was wrong.

## Why it was wrong

We expected the agent to read PV's broken output and trust it. The agent's actual tool sequence in EVERY scenario, including the clean baseline, was:

```
1. find … -type f | sort       (lists all 32 fixture files)
2. Read src/billing/subscription.js
3. Read src/billing/subscribe.js
4. Read src/billing/invoice.js
5. Read test/billing.test.js
6-9. Edit × 4
10. node test/*.test.js
```

**`pv ask` was never invoked.** Not in any scenario. Not even in the clean baseline. With a 32-file fixture and a clear task ("add a `currency` field to Subscription"), the agent could see the file structure from `find`, recognize the four billing files it needed, and edit them directly. The minimal CLAUDE.md said "run `pv ask` first", but the agent silently chose `find` + intuition instead.

So our injected drift went *unread*. The agent never consulted PV, so PV's wrongness didn't propagate to the code edits.

## Implication for the bench-002 narrative

This invalidates a comfortable interpretation of bench-002: that `with-pv-v3` saved tokens because the agent used PV's narrowed file set. Looking back at the bench-002 task-1 with-pv-v3 tool patterns, the agent there *also* used `find` + 4 reads — same as bench-003 here. **The v3 win over without-pv came from somewhere else.**

Comparing the two conditions on the same task:

| condition | tool sequence | tools |
|---|---|---|
| bench-002 task-1 without-pv | `Agent(Explore subagent)` + `find` + Read × 11 + Edit × 4 + tests | 24.5 |
| bench-002 task-1 with-pv-v3 | `find` + Read × 4 + Edit × 4 + tests | 10.0 |

The `without-pv` agent reached for the `Explore` subagent and read defensively across the entire `billing/` directory. The `with-pv-v3` agent — given a 6-line CLAUDE.md noting that the repo has a structured `.polaris/graph.json` — went straight to the 4 files it needed from the `find` output. **PV's value, in this fixture, was the *framing* the CLAUDE.md provided, not any actual `pv` tool invocation.** The graph existed. The agent never read it. But knowing that "this repo has architecture metadata" appeared to be enough to dampen defensive reading.

## What this means

- **PV's measured wins on small repos are partially a placebo of confidence.** The agent reads less defensively when told the architecture is structured. Whether the agent actually uses PV is independent.
- **Drift safety can't be measured here.** Until we either (a) force PV usage with a much stronger CLAUDE.md that *requires* `pv ask`, or (b) test on a fixture large enough that `find` + intuition becomes unworkable, the drift question stays open.
- **Honest framing for users:** at 32 files, with Sonnet, a clean graph plus minimal CLAUDE.md gives ~50% fewer tool calls vs no graph at all. But the mechanism is "agent feels confident enough not to pre-read defensively", not "PV told the agent which files to edit." A stale graph in this regime is *also* harmless, because the agent never asks.

## Next experiments (not run)

To actually measure drift impact:

1. **Force PV usage.** A scenario E with a CLAUDE.md that says: *"You MUST run `pv ask` and treat its `impact.files` as the complete set. Do not list directories or read files outside that set."* Then re-run the four drift scenarios. Hypothesis: B/C/D now produce missing-required > 0.
2. **Larger fixture.** Scaffold a 200+ file repo where blind `find` returns too much to be useful. The agent's defensive option is unaffordable; PV's value (and drift cost) becomes measurable.
3. **Cross-domain task that genuinely requires the graph.** "When a refund is processed, also send a notification" — touches billing AND a notification module the agent doesn't know exists. The graph is the only way to surface the cross-domain link without the agent reading every file.

## Layout

```
bench-003/
├── README.md                          (this file)
├── run.sh, aggregate.sh
├── conditions/with-pv-v3/CLAUDE.md    (copied from bench-002)
├── bin/pv                             (shim → repo's dist/cli.js)
├── scenarios/
│   ├── A-clean/{graph,codemap}.json
│   ├── B-stale-codemap/{graph,codemap}.json
│   ├── C-stale-relations/{graph,codemap}.json
│   └── D-multi-drift/{graph,codemap}.json
└── runs/<scenario>/run-NN/
```

Scenarios were generated programmatically from the bench-002 fixture's
clean `.polaris/` files; see `run.log` for the python snippet.
