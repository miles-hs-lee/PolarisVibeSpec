# bench-006 — does the Layer 3 `--prompt` mode actually catch drift?

## What we set out to measure

`pv prd check --prompt` emits a structured prompt for the user's
coding agent to perform LLM-assisted semantic alignment between a
PRD and the Intent graph. We had unit tests confirming the prompt
is well-formed, but **never tested whether the prompt actually
produces useful drift detection** when run through an LLM.

The central question:

> When given a PRD with a known, planted drift (or no drift at all),
> does an agent following our prompt produce the right answer in the
> right output category?

## Setup

Four small synthetic scenarios, each with a 2–3 node graph, a
1-section PRD, an `expected.md` describing what the agent should
flag, and an `<!-- pv-intents: ... -->` directive. We ran each
through a fresh general-purpose Claude agent (no conversation
context, only the prompt file).

| Scenario | Drift type | Expected category |
|---|---|---|
| **A** Aligned | none (control) | all empty |
| **B** Missing capability | PRD claims passkey signin; graph has only password | `missing_in_graph` |
| **C** Contradiction | PRD says username login; graph says email-only | `contradictions` |
| **D** Unlinked Intent | PRD describes sign-out; graph has API-AUTH-LOGOUT but section directive doesn't link it | `graph_concepts_unmentioned` |

The full prompt for each scenario lives in `runs/<name>.prompt.md`;
the agent's response in `runs/<name>.response.md`; the planted drift
spec in `scenarios/<name>/expected.md`.

## Results

| Scenario | Hit? | Category match? | Notes |
|---|---|---|---|
| A Aligned | ✅ | ✅ | All four arrays empty. Zero false positives. |
| B Missing capability | ✅ | ✅ | Two `missing_in_graph` items (passkey signin + passkey/password precedence). Specifically avoided `contradictions` and `synonym_pairs`. |
| C Contradiction | ✅ | ✅ | Two `contradictions` items (one per linked Intent), with explicit reasoning for not using `missing_in_graph` or `synonym_pairs`. |
| D Unlinked Intent | ⚠️ partial | ❌ wrong category | Drift was caught (4 items in `missing_in_graph` covering the entire sign-out flow) but classified as missing rather than `graph_concepts_unmentioned`. |

**Headline:** 4/4 scenarios produced an actionable signal. 3/4 used
the exactly correct output category. 0/4 produced false positives.
Schema adherence was 100%.

## Why D is in the wrong category

This is a real prompt-design limit, not an agent failure.

The prompt for a section includes:
- The PRD section's prose
- The Intent nodes named in the section's `<!-- pv-intents: -->`
  directive
- Their 1-hop graph neighbors

In scenario D, the section directive only listed `REQ-AUTH-001`.
`API-AUTH-LOGOUT` exists in the graph but has no relations to
`REQ-AUTH-001`, so it was *not* in the agent's context. The agent
literally never saw the unlinked-but-relevant node.

Faced with "section claims X, my linked Intents don't represent X,
I have no other graph context," the agent did the rational thing
and reported X as `missing_in_graph`. From the user's perspective
the actionable signal is the same — *"this section claims sign-out
behavior that isn't covered by its links"* — they just need to
check graph.json themselves to discover whether an unlinked node
already exists.

Two ways to close the gap, both deferred to a Phase 2 prompt
upgrade:

1. **Same-domain Intents in section context** — include all graph
   nodes sharing the section's domain, marked as "in same domain
   but not linked." Token cost grows with graph size.
2. **Frontmatter intents as fallback context** — if the section
   directive is sparse, include the document's `intents:`
   frontmatter list. Cheaper than (1), only catches the case
   where the human already noted the link in the global summary
   but forgot the per-section directive.

Neither is needed to ship Layer 3 with current honesty: the user
gets a real signal in 4/4 scenarios. The category is "wrong" only
in the sense of the JSON taxonomy, not in the actionable result.

## Cost

| Scenario | Tokens (in+out) | Approx cost |
|---|---|---|
| A | ~27.4K | ~$0.05 |
| B | ~27.5K | ~$0.05 |
| C | ~27.6K | ~$0.05 |
| D | ~27.7K | ~$0.05 |
| **total** | **~110K** | **~$0.20** |

So a typical PRD-with-5-sections drift check via `--prompt` would
land around $0.05–$0.30 per run on Claude. Cheap for an
infrequent operation; not an everyday CI step.

## What this tells us about Layer 3

✅ **The mechanism works.** Schema adherence was perfect across all
4 runs. JSON could be parsed and acted on programmatically.

✅ **False-positive rate near zero on the control.** A self-aligned
PRD produces an empty drift report.

✅ **Recall is good on the cases the prompt design covers.** Missing
capabilities and contradictions were caught with appropriate
categorization and clear reasoning.

⚠️ **Recall is limited by what's in the prompt.** The agent can
only flag drift it can see. Unlinked-but-relevant Intents in the
graph are invisible unless we expand the section context. This is
a known limitation, documented honestly rather than papered over.

✅ **The prompt's "Scope of drift" guidance works.** A baseline run
on PV's own CORE.md (without that guidance) produced 8 false
positives flagging thesis/positioning content. After adding the
guidance, the same baseline run produced 0 false positives. (See
the `prompt-eval-history.md` notes if we ever publish them.)

## Reproducing

Requires Node 18+ and a working `dist/cli.js` (run `npm run build`
in the repo root).

```bash
# 1. Generate the prompts for each scenario.
bash run.sh

# 2. For each scenarios/<name>.prompt.md, paste the contents into
#    your coding agent (Claude Code, Codex, etc.) with the
#    instruction "follow the embedded instructions exactly, output
#    only the JSON and a short summary".

# 3. Save each agent's response to runs/<name>.response.md.

# 4. Compare against scenarios/<name>/expected.md by hand.
```

There's no automated scoring step. With non-deterministic LLM
output and N=1 runs, manual review is the honest level of rigor.
A future iteration could add a scoring rubric (TP/FP/FN per
category) and automated invocation, but four scenarios with one
run each is enough to answer the binary "does it work at all?"
question.

## Honest limits of this bench

- **N=1 per scenario.** Same prompt, different runs, may differ.
  Borderline cases (synonym pairs, category boundaries) won't be
  reliably reproduced.
- **Synthetic fixtures.** Real PRDs are messier, longer, and have
  weird formatting. Real graphs have more nodes, denser relations,
  and ambiguous neighbors.
- **One LLM (Claude via the Agent tool).** Claude-specific
  reasoning patterns may not generalize to GPT, Gemini, or smaller
  open models. We didn't test cross-vendor consistency.
- **English-only fixtures.** PRDs in mixed Korean/English (the
  expected use case for many adopters) might surface different
  failure modes — translation gaps in the prose vs the graph,
  for instance.

These don't invalidate the headline result (the mechanism works on
the cases it's designed for), but they bound how confidently we
can claim broad drift-detection capability. The honest framing
remains the one in `docs/PRD-DESIGN.md`:

> "Layer 3 results depend on the LLM the user runs them through.
> Different agents will produce different reports. PV is not the
> authority — the user is."
