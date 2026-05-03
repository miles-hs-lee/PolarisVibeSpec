# bench-007 — does `pv review --prompt` actually catch intent drift?

## What we set out to measure

bench-006 measured `pv prd check --prompt` (Layer 3 PRD ↔ graph drift)
on synthetic fixtures and found 4/4 actionable signals. This bench
does the same thing for the *new* command — `pv review [<base>]
--prompt` — which takes a git diff and emits an LLM prompt asking
"does this code change imply intent-layer updates?".

The central question:

> When a PR introduces a known kind of intent drift, does the agent
> following our review prompt produce the right `patches` array in
> the right category, while leaving aligned PRs untouched?

This is the **first measurement of `pv review`'s real value**, and
also the first data point under the new "drift gate" positioning
agreed with the user (vs the deprecated "agent token-savings
preamble" framing).

## Setup

Each scenario is a self-contained shell script that builds a tmp git
repo with two commits: an initial state (graph + code + PRD aligned)
and a "PR" commit that introduces a planted drift. `pv review HEAD~1
--prompt` is then run against the tmp repo and the resulting prompt
is piped to a fresh general-purpose Claude agent (no conversation
context, only the prompt file).

| Scenario | Planted drift | Expected category |
|---|---|---|
| **A** Aligned (control) | None — pure refactor (extract helper) | `patches: []` |
| **B** Stale description | code: `bcrypt(password)` → `verifyPasskeySignature(assertion)`; intent description says "password verification" | `intent_description_update` |
| **C** New feature, no Intent | new file `passkey-register.ts` for `POST /auth/passkey/register`; codemap attaches it to the wrong node (API-AUTH-LOGIN); no new Intent node | `new_intent_node` (and bonus: `codemap_link` remove) |
| **D** PRD contradicts code | code: `SESSION_TTL_MS` shortened from 24h to 1h; PRD prose still says "24 hours" | `prd_section_update` |

The scenario scripts live in `scenarios/<name>.sh`; prompts in
`runs/<name>.prompt.md`; agent JSON+summary responses in
`runs/<name>.response.md`.

## Results

| Scenario | Prompt size | Tokens (in) | Latency | Hit? | Bonus catches |
|---|---|---|---|---|---|
| A Aligned | 3,552 B / 106 lines | ~27.6K | 12.5s | ✅ `patches: []` | — |
| B Stale description | 3,434 B / 101 lines | ~28.1K | 19.4s | ✅ 1 expected + 2 bonus | also caught REQ-AUTH-001 title needing update; also caught the PRD "Story: signing in" section needing rewrite |
| C New feature, no Intent | 3,521 B / 107 lines | ~28.3K | 20.0s | ✅ 1 expected + 2 bonus | also flagged the codemap link as wrongly attached to API-AUTH-LOGIN and proposed a `codemap_link` remove; also proposed extending the PRD story |
| D PRD contradicts code | 3,216 B / 96 lines | ~27.6K | 14.3s | ✅ 1 expected, no bonus | — |

**Headline:** **4/4 scenarios hit on the expected drift category, 0/4
false positives on the control, and the agent caught additional real
drift in 2/4 (B and C) that the test design didn't pre-specify.**

Total cost across all four runs: **~$0.30** (≈ $0.05–0.10 per scenario
at Claude Sonnet 4.6 pricing).

## Why scenarios B and C produced *extra* patches

Looking carefully, the bonus patches are actually correct, not
overproduction:

- **B** — The graph has REQ-AUTH-001 *titled* "Email + password login"
  and a PRD section *literally* asserting password verification. When
  the code switches to passkey, all three artifacts become
  simultaneously stale. The agent was right to patch all three.
- **C** — The scenario plants two drifts: a missing Intent node *and*
  a wrong codemap entry. The agent caught both; we under-specified
  the expected output.

This argues the prompt's `--prompt` JSON spec works well enough that
the agent finds *more than the minimum*. Better than the alternative
(missing the planted drift).

## What this tells us about `pv review`

✅ **The mechanism works.** Schema adherence: 100%. JSON parses;
fields populate the documented shape; categories used correctly.

✅ **False-positive rate near zero on the control.** Pure refactor
produces `patches: []` with explicit reasoning ("the function
preserves identical external behavior"). The "Be conservative" prompt
guidance does its job.

✅ **Recall on the three real drift kinds is good.** Description
mismatches, missing Intents, and PRD contradictions all surface
clearly and with proposed text the user can review.

✅ **The prompt's "scope of drift" framing — distinguishing thesis
from contradiction — carried over from the bench-006 prompt-design
fix. No false positives on roadmap/positioning content.**

⚠️ **Synthetic ≠ real.** All scenarios are 1-section PRDs and 2-3
node graphs. Real PRs touch more files, more nodes, longer PRDs.
bench-007 doesn't measure scaling — see "Cost / scaling" below.

⚠️ **N=1 per scenario.** LLM output is non-deterministic; same prompt
re-run could miss a bonus catch or invent a different one. This is
a single data point per scenario, not a distribution.

## Cost / scaling

bench-007 ran on toy fixtures. The interesting comparison is the
prompt size we hit on PV's *own* repo, where Phase A compression
fixes were also measured:

| Source | Prompt size (bytes / lines) | Tokens (rough) |
|---|---|---|
| `pv review HEAD~3 --prompt` baseline (24-file PR, 30 linked nodes) | 129,031 / 3,272 | ~32K |
| → after Fix 1 (PRD section dedup) | 116,238 / 3,046 | ~29K (-9.9%) |
| → after Fix 2 (diff cap 200 lines/file) | 94,246 / 2,386 | ~24K (-27.0% cumulative) |
| → after Fix 3 (description truncate 400 chars) | 93,040 / 2,386 | ~23K (-27.9% cumulative) |

The biggest win was the diff cap; PRD dedup helped less than expected
because in PV's own repo most PRD sections are referenced by 1-2
nodes, not many. Description truncate barely moved the needle —
descriptions in this repo are already short. The relative weight on
real-world PRDs (longer descriptions, more shared sections) will
differ.

For *typical* small PRs (3-10 source files):
- Before fixes: 10K-30K tokens, $0.03-$0.10 per review
- After fixes: 8K-20K tokens, $0.025-$0.07 per review

For *large* PRs (50+ source files): even with the fixes, expect
50K-100K tokens. Probably the upper end of what's reasonable per-PR;
huge codebases will need a chunked-review architecture (per-section
prompts) to scale further.

For the bench-007 toy fixtures themselves, the prompts are tiny
(~3.5KB each) so compression-level differences don't show; the
benefit is for real-world PRs.

## Honest limits of this bench

- **Toy graphs.** Each scenario has 2-3 nodes, 1 PRD section. Real
  graphs have dozens of nodes per domain and hundreds of sections.
  Recall on a 200-node graph is unmeasured.
- **One LLM (Claude via the Agent tool).** Cross-vendor consistency
  not tested. GPT or Gemini might over- or under-propose differently.
- **N=1 per scenario.** Re-running may surface different bonus
  catches or missed expected ones; we don't have variance numbers.
- **Synthetic drifts are clean.** Real-world drift is messier — the
  description is "kinda still right", the PRD prose is ambiguous,
  the new endpoint shares behavior with an existing one. We don't
  test the muddy middle.
- **No measurement of end-to-end "fix flow".** We caught the drift
  in the JSON; we haven't validated that a user could take the
  proposed patches and apply them via `pv generate` / `pv promote`
  without ambiguity.

These don't invalidate the headline (the mechanism works, on the
cases it's designed for) but they bound the confidence. The honest
framing matches `docs/PRD-DESIGN.md`'s line about Layer 3:

> "Layer 3 results depend on the LLM the user runs them through.
> Different agents will produce different reports. PV is not the
> authority — the user is."

## Reproducing

Requires Node 18+, a working `dist/cli.js` (run `npm run build` from
repo root), and a coding agent that follows Markdown prompts (Claude
Code, Codex, etc.).

```bash
# 1. Generate prompts for all four scenarios.
for s in A-aligned B-stale-description C-new-feature-no-intent D-prd-contradicts-code; do
  bash setup-scenario.sh "$s"
done

# 2. For each scenarios/<name>.prompt.md, paste it into your coding
#    agent with: "follow the embedded instructions exactly, output
#    only the JSON and a short summary".

# 3. Save each response to runs/<name>.response.md.

# 4. Compare against the headline table above by hand.
```

There's no automated scoring — manual review against the planted-
drift design is the honest level of rigor for N=1 per scenario.
