# Post-pivot intent-traceability audit (2026-05-04)

## Why this audit

The project's framing shifted dramatically over five commits:

```
8f9e18c Phase 1: pv changed — the intent-drift gate
c8d8814 Phase 2: pv review --prompt — semantic intent review
8f17a63 Phase A prompt compression + bench-007
a99e995 README rewrite (clean current-positioning narrative)
a6b8c71 Doc pivot: POSITIONING + CORE + CLAUDE + SKILL to drift-gate framing
```

Up to this point PV had been positioned as an *agent token-savings
preamble*. The pivot reframed it as a *repo-local intent traceability
checker*. README, POSITIONING, CORE PRD (en + ko), CLAUDE.md, and
the agent skill were rewritten to match.

Whenever docs change at this scale, three things can drift:

1. **PRD prose vs Intent graph** — e.g. PRD claims a behavior the
   graph doesn't model.
2. **Code vs Intent** — e.g. new behavior in source not reflected in
   any node description.
3. **`spec/` vs graph** — handled deterministically by `pv export-all`.

This is the natural use case for PV itself: catch its own drift after
a self-rewrite. So we ran the full traceability suite — Layer 1
structural, Layer 3 semantic — and recorded the result. This file
*is* the audit log.

## The audit

### Step 1 — Layer 1 structural checks

```bash
pv validate
pv health
pv prd check
```

Result:

| Command | Outcome |
|---|---|
| `pv validate` | **clean** — 53 nodes, 37 codemap entries, 0 errors, 0 warnings |
| `pv health` | 1 isolated node flagged: `ENT-PV-OUTPUT`. **Pre-existing** — not introduced by the pivot. (The output module is a thin emit/fail helper that no Intent currently traces *to*; honest gap, separate from this audit.) |
| `pv prd check` | **clean** — 50 references across CORE.md + CORE.ko.md, 0 dangling, 0 malformed |

Verdict: **the pivot did not introduce structural drift**.

### Step 2 — `pv changed HEAD~4` (full pivot diff)

```bash
pv changed HEAD~4
```

Result:

```
ok: True
summary: {
  files_in_diff: 35,
  linked_nodes_touched: 22,
  linked_prds_touched: 2,
  orphan_added: 0,
  broken_codemap: 0
}
findings: 22 (all severity=info)
```

22 changed files in the diff link cleanly to existing Intent nodes;
the PRDs touched are the two `docs/prd/CORE*.md` files; no new files
slipped through without a codemap entry; no codemap entries point at
removed files.

Verdict: **the file-system changes are fully reflected in the intent
layer**.

### Step 3 — `pv prd check --prompt` (Layer 3 PRD ↔ graph)

Generated the Layer 3 prompt:

```bash
pv prd check --prompt > /tmp/audit-prd.md
# 1,787 lines / 161,831 bytes / ~40K tokens
```

Sent to a fresh general-purpose Claude agent with no conversation
context. The agent walked all 18 sections (9 per PRD × 2 languages)
and returned **`patches: []` for every section** — no
`missing_in_graph`, no `contradictions`, no `synonym_pairs`, no
`graph_concepts_unmentioned`.

The agent's qualitative summary:

> "The rewrite landed cleanly. Every concrete capability claim in
> both the Korean and English PRDs maps directly to a linked Intent
> node. … Section 8 (Roadmap) and Section 9 (Why this PRD exists)
> intentionally have no linked Intents per the directive convention,
> which is correct since they cover unbuilt work and meta-narrative
> respectively. Nothing actionable surfaced."

Verdict: **the rewritten PRD prose is in semantic alignment with the
graph**. Token cost: ~$0.10 (98K input tokens, 35.8s latency).

### Step 4 — `pv review HEAD~4 --prompt` (Layer 3 code ↔ intent)

Generated the review prompt covering the full pivot diff:

```bash
pv review HEAD~4 --prompt > /tmp/audit-review.md
# 3,476 lines / 160,930 bytes / ~40K tokens
```

Sent to a fresh agent. The agent walked **16 specific drift signals**
(new commands, refactored helpers, graph node additions, doc rewrites,
skill/CLAUDE.md updates, bench-007 claims, etc.) and returned
**`patches: []`**.

It surfaced **one borderline observation** under the conservative
bar:

> "The only borderline observation is that `API-PV-REVIEW` doesn't
> list `ENT-PV-CODEMAP` in its `uses` edges even though the prompt
> builder reads `result.codemap`, but PV's existing convention treats
> transitive usage through `uses → API-PV-CHANGED` as sufficient, so
> per the conservative bar this is not a patch."

We chose to act on it. The transitive justification is real but
weak: `appendLinkedContextSection` in `src/commands/review.ts`
*directly* iterates `result.codemap`, not just delegates to a helper
that does. Adding the explicit edge is a small honest improvement.

### Step 5 — fix applied

```python
# .polaris/graph.json
node['API-PV-REVIEW'].relations.append({
    'type': 'uses',
    'target': 'ENT-PV-CODEMAP'
})
```

Followed by `pv export-all` and `python3 scripts/regen-diagrams.py`
to keep `spec/` and the embedded ARCHITECTURE diagrams synchronized.

Re-ran:

| Command | Outcome |
|---|---|
| `pv validate` | clean (0 errors) |
| `pv prd check` | 50 references, 0 dangling |
| `pv changed HEAD~4` | still 0 orphan / 0 broken |

## What the audit cost

| Step | Tokens | Wall time | Cost |
|---|---|---|---|
| Layer 1 (validate / health / prd check) | 0 (no LLM) | <1s | $0 |
| `pv changed HEAD~4` | 0 (no LLM) | ~1s | $0 |
| Layer 3 PRD ↔ graph (`prd check --prompt`) | ~98K input | 35.8s | ~$0.10 |
| Layer 3 code ↔ intent (`review --prompt`) | ~114K input | 85.5s | ~$0.12 |
| **Total** | ~212K | ~123s | **~$0.22** |

Two layer-3 calls of ~40K-token prompts on a substantial five-commit
diff, finishing in ~2 minutes. Cheap enough to run after every
non-trivial PR; not cheap enough to run on every commit.

## What the audit found

| Layer | Catches | False positives | Notes |
|---|---|---|---|
| Layer 1 (graph/codemap/PRD ID validation) | 0 | 0 | Pivot preserved structural integrity end-to-end. |
| Layer 1 (`pv changed` diff vs codemap) | 0 | 0 | Every changed file is linked. |
| Layer 3 (PRD prose ↔ graph) | 0 | 0 | The PRD rewrite was prose-faithful to the graph it cites. |
| Layer 3 (code ↔ intent prose) | **1 (small)** | 0 | `API-PV-REVIEW` missing explicit `uses → ENT-PV-CODEMAP`. |

**One catch out of four layers**, and it was a small relation
omission the agent itself flagged as borderline. The control signal
across the audit — *the rewrite is well-aligned with the underlying
artifacts* — is the headline outcome.

## What this tells us about PV's value

This audit **is the use case** PV was designed for. Five commits of
substantial doc rewrite + behavioral changes (two new commands), and
the four-layer suite either confirmed alignment (3 layers) or
surfaced a real but minor gap (1 layer). Without this tool the
omitted `uses` edge would likely have lived in the graph indefinitely;
with it, the catch took ~$0.12 and 85 seconds.

The honest framing remains:

- This is **N=1 audit on N=1 project (PV itself)**. Doesn't generalize
  to "PV always catches X% of drift on real teams' PRs."
- The agent ran each prompt **once**. Re-running might surface a
  different borderline observation or miss this one.
- The pivot's authors (the user and the assistant doing the work)
  were *deliberately careful* about keeping the layers in sync —
  graph nodes were added in the same commit as code, codemap kept
  current, PRDs updated to match. So a "clean audit" partly reflects
  the discipline used during the pivot, not just the audit tool's
  power.
- A pivot done sloppily would generate many catches; that's a
  separate experiment we haven't run.

What this audit *does* show:

1. The Layer 1 + Layer 3 commands compose naturally for a
   non-trivial multi-commit review.
2. Cost lands in the "single-PR-affordable" range.
3. The audit doc itself becomes a permanent PR-review artifact —
   future maintainers can see exactly what was checked, what passed,
   and what was caught.

## Reproducing

```bash
# Layer 1 — fast, deterministic, free
pv validate
pv health
pv prd check
pv changed HEAD~4

# Layer 3 — LLM-assisted, ~$0.20 total
pv prd check --prompt > /tmp/audit-prd.md
pv review HEAD~4 --prompt > /tmp/audit-review.md

# Pipe each to your coding agent with: "follow the embedded
# instructions; output JSON + a short summary"
```

## References

- The pivot commits: 8f9e18c → a6b8c71 on main
- Layer 3 prompt design: [`docs/PRD-DESIGN.md`](../../docs/PRD-DESIGN.md)
- Layer 3 prompt-quality benches:
  [`bench-006-prompt-quality/`](../bench-006-prompt-quality/) and
  [`bench-007-review-quality/`](../bench-007-review-quality/)
- The fix landed in this audit: `API-PV-REVIEW` graph node, added
  `uses → ENT-PV-CODEMAP`
