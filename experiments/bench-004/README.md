# bench-004 — does scale or coercion change the picture?

## What we set out to measure

After bench-003 found that the agent on a 37-file fixture *never invoked `pv ask`* (and that bench-002's measured savings were mediated by framing, not by direct PV use), two open questions remained:

- **Does fixture size alone make the agent reach for PV?** Hypothesis: at some size, `find` returns too many paths and the agent picks `pv ask` instead.
- **If we coerce PV usage**, do the savings show up? Or is the coerced call pure overhead?

Setup: a fresh 86-file fixture (`fixtures/large-app/`) across six domains (auth, users, billing, orders, notif, analytics) with ~30 nodes in the PV graph. Same `currency`-on-User-and-Subscription-and-Invoice task. Three conditions:

- **without-pv**: 5-line CLAUDE.md, no PV mention
- **with-pv-v3**: 5-line CLAUDE.md saying "run `pv ask` first" (same shape as the bench-002 winner)
- **with-pv-forced**: 18-line CLAUDE.md with "you MUST run `pv ask` before reading any source file"

N=2 each, Sonnet, headless.

## What actually happened

| condition | tests | missing_req | tool_uses | pv_calls | cost | wall |
|---|---|---|---|---|---|---|
| without-pv | 2/2 | 0.00 | 9.0 | 0.0 | $0.088 | 25.0s |
| with-pv-v3 | 2/2 | 0.00 | **9.0** | **0.0** | $0.077 | 25.0s |
| with-pv-forced | 2/2 | 0.00 | 10.0 | **1.0** | $0.094 | 35.5s |

Three honest findings:

### 1. The framing effect is weaker on this fixture

In bench-002 (37 files), `without-pv` ran 24.5 tools / 69s on the same task shape; `with-pv-v3` ran 13 / 50.5s. The gap was real.

In bench-004 (86 files), `without-pv` ran 9.0 tools / 25s. The `find` + 4-file-read pattern was already tight. **The defensive-reading regime that PV's framing dampened in bench-002 didn't show up here at all.** Larger fixture, but a clearer / more specific task description, and the agent went straight to the four files it needed without exploring.

So bench-002's "framing wins" was probably partly an artifact of the bench-002 task description plus that fixture's `Explore` subagent affinity. Bigger isn't automatically better for demonstrating PV's framing value.

### 2. `with-pv-v3` did not invoke `pv ask` even at this scale

The minimal CLAUDE.md said "run `pv ask` first." On both runs, the agent ignored it and used `find` + intuition — same as bench-003. **`pv_invocations: 0` on every with-pv-v3 run.**

So at this fixture size with this model, the only way to make the agent actually use PV is to *coerce* it.

### 3. Coerced PV is pure overhead on a task that doesn't need it

`with-pv-forced` agents did follow the instruction (`pv_invocations: 1` per run). The result: **+1 tool call, +42% wall, +7% cost, identical correctness.** The forced `pv ask --minimal` call took ~10 seconds and added an output the agent had to read, but the four files it pointed at were the same four the unforced agents found via `find`.

PV's directly-routed value wasn't demonstrated because the task — even on an 86-file repo — was solvable by reading filenames. The agent didn't need a graph to know that "add currency to User, propagate to Subscription, propagate to Invoice" touches `users/user.js`, `billing/subscription.js`, `billing/subscribe.js`, `billing/invoice.js`. The names are obvious.

## What this means

PV's directly-routed value (the `pv ask` → read-only-impacted-files pattern) needs three things at once to show up empirically:

1. A fixture large enough that `find` is unhelpful (86 files apparently isn't there yet for this model).
2. A task whose right file set is *not* obvious from filenames — typically a cross-domain link that the graph encodes but the directory structure doesn't.
3. An agent that will actually invoke `pv ask` (which on Sonnet means coercing it via CLAUDE.md, accepting the per-call overhead).

We have 0 of the 3 conditions met cleanly. bench-002 met (1) partially via the task framing; bench-003 disconfirmed (3); bench-004 disconfirmed (1) and shows (3) is expensive when not needed.

So the honest framing for users:

- **The framing value is real but task-dependent.** It shows up on tasks where the agent would otherwise be defensive (multi-step refactor, "I don't know which files are relevant"). On clear, scoped tasks the agent is already efficient and PV adds nothing.
- **The routing value is unmeasured at any scale we've tested.** It probably exists for cross-domain tasks the graph encodes but filenames don't reveal — bench-005 territory.
- **The documentation value is intact.** `spec/` as auto-generated architecture doc, `pv validate` as drift detection, PR-readable graph diffs. None of this depends on the agent invoking PV.

## What bench-005 would test

A task where the right file set is *only* obvious from the graph:

> When a `Subscription` is cancelled, fire an analytics event and queue a churn-risk notification email.

Files involved: `billing/cancel.js` (start), `analytics/event.js` (cross-domain), `notif/email.js` (cross-domain), `notif/template.js` (sub-cross-domain). The agent without PV would have to discover that cancel triggers analytics and notifications — those links exist only in the graph. With `pv ask`, the cross-domain set falls out of `pv impact API-BILLING-CANCEL`.

Not run here. Open question.

## Layout

```
bench-004/
├── README.md                          (this file)
├── setup-fixture.sh                   (generates ~85 files across 6 domains)
├── scripts/gen-graph.sh               (writes .polaris/{graph,codemap}.json)
├── run.sh, aggregate.sh
├── conditions/
│   ├── without-pv/CLAUDE.md
│   ├── with-pv-v3/CLAUDE.md
│   └── with-pv-forced/CLAUDE.md
├── bin/pv                             (shim → repo dist/cli.js)
├── task.txt
├── expected-files.txt
├── fixtures/large-app/                (regeneratable)
└── runs/<condition>/run-NN/
```
