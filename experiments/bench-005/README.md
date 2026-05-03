# bench-005 — does the routing value exist? (yes, but only on cross-domain hidden-link tasks)

## What we set out to measure

Bench-002 measured savings on a task whose right files were obvious from filenames; bench-003 found the agent never actually invoked `pv ask`; bench-004 confirmed the framing effect doesn't reproduce uniformly and that coerced PV is overhead on tasks the agent can solve from `find` alone. After all that, the central open question was:

**Is there ANY task where PV's directly-routed value (`pv ask` → impacted_files → focused reads) shows up empirically?**

The answer should be yes for tasks whose right file set is encoded in graph relations but **not obvious from filenames** — i.e., where filename-driven intuition would miss something.

## Setup

Same 86-file fixture as bench-004 (auth, users, billing, orders, notif, analytics) — but the graph adds two `affects` edges from `API-BILLING-CANCEL`:

```
API-BILLING-CANCEL  affects→  ENT-ANALYTICS-EVENT
API-BILLING-CANCEL  affects→  ENT-NOTIF-MESSAGE
```

These edges are **the only place** the cancellation→analytics+notif connection exists. The actual code in `billing/cancel.js` doesn't import either module yet; that's what the task asks for.

`pv impact API-BILLING-CANCEL` returns the cross-domain set:

```
nodes:  API-BILLING-CANCEL, ENT-ANALYTICS-EVENT, ENT-NOTIF-MESSAGE,
        API-ANALYTICS-TRACK, API-NOTIF-EMAIL, API-NOTIF-SMS
files:  src/analytics/event.js, src/analytics/track.js,
        src/billing/cancel.js, src/billing/unsubscribe.js,
        src/notif/email.js, src/notif/queue.js,
        src/notif/sms.js, src/notif/template.js
```

The task: "When a subscription is cancelled, record an analytics event and queue a churn-risk notification email." Three conditions, N=2 each.

## Results

| condition | n | tests | missing_req | tool_uses | pv_calls | cost | wall |
|---|---|---|---|---|---|---|---|
| without-pv | 2 | 2/2 | 0.00 | **44.0** | 0.0 | $0.225 | 103.5s |
| with-pv-v3 | 2 | 2/2 | 0.00 | 28.0 | 0.5 | $0.197 | 80.5s |
| with-pv-forced | 2 | 2/2 | 0.00 | **20.5** | 3.5 | $0.192 | 82.0s |

vs `without-pv`:

- `with-pv-v3`: −36% tools, −22% wall, −13% cost (bimodal — see below)
- `with-pv-forced`: **−53% tools, −21% wall, −15% cost**

All runs passed all five test suites. All required files were modified.

## Three observations

### 1. The cross-domain task IS genuinely harder for `without-pv`

Compared to bench-004's `currency`-on-`User` task (same fixture, 9.0 tools / 25s baseline), bench-005's `cancel`→`analytics`+`notif` task takes the without-pv agent **44 tools and 103.5s** — almost 5× the work. The agent really is exploring more, presumably because filename intuition (cancel.js → modify) doesn't tell it which analytics + notif files to wire in. From the tool stream the without-pv agent ran multiple finds, opened a dozen files across analytics/ and notif/, and went through several false starts.

This confirms the open hypothesis from bench-004's "what bench-005 would test": cross-domain hidden-link tasks ARE more expensive without PV. The cost gap was hidden in bench-002/004 because those tasks were filename-obvious.

### 2. The agent VOLUNTARILY invoked `pv ask` in this regime

In bench-003 and bench-004, the with-pv-v3 condition (minimal CLAUDE.md saying "run pv ask first") was ignored every time — the agent went straight to `find` + intuition. Bench-005 v3 is **bimodal**: run-01 invoked `pv ask` once (19 tools, 75s); run-02 didn't (37 tools, 86s). When the task is hard enough that filename intuition is uncertain, the agent reaches for PV at least sometimes. This is the first bench across five where the v3 condition organically used the tool.

### 3. Coercing `pv ask` is **net positive** here, not overhead

In bench-004 (filename-obvious task), forcing `pv ask` cost +1 tool, +42% wall, +7% cost. In bench-005 (cross-domain hidden), forcing `pv ask` saves **−53% tools, −21% wall, −15% cost** vs `without-pv`. Same coercion, opposite sign. The variable is the task, not the coercion.

## What this resolves

After four benches that couldn't isolate the routing value, bench-005 finally measures it directly. Combined with the framing and documentation values that hold elsewhere, PV's three-axis value framework now has empirical support on each axis:

| value | confirmed by | notes |
|---|---|---|
| Framing (less defensive reading) | bench-002 | task-dependent; doesn't reproduce on filename-obvious tasks at scale |
| **Routing tools (`pv ask` cross-domain)** | **bench-005** | only when graph encodes a link filenames don't, AND agent invokes PV |
| Documentation (auto spec, validate, drift) | all benches | independent of agent behavior |

## Caveats

- N=2 per condition; the with-pv-v3 cell is bimodal so its mean masks the underlying behavior. The forced cell is more stable.
- Sonnet only.
- Single task. The cancel→analytics+notif setup is plausibly representative of "service touches multiple domains" — but a different cross-domain task might give different numbers.
- The graph was specifically authored to encode the cross-domain relation. In a real adoption, the question becomes *whether the team encodes such relations* — bench-002/003/004 all worked with hand-curated graphs whose relations matched the code; this graph deliberately encodes a relation the code DOESN'T have yet (the task fills it in).

## Layout

```
bench-005/
├── README.md                          (this file)
├── setup-fixture.sh                   (copies bench-004 fixture, patches graph)
├── run.sh, aggregate.sh
├── conditions/                        (copied from bench-004)
├── bin/pv
├── task.txt
├── expected-files.txt
├── fixtures/large-app/                (regeneratable)
└── runs/<condition>/run-NN/
```
