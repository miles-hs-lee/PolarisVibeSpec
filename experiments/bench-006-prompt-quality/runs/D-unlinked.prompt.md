# Drift check: prd.md

You are checking a Product Requirements Document (PRD) against the Intent graph that describes the codebase. Your job: find places where the PRD makes claims about *current product capabilities or behaviors* that aren't reflected in the Intent graph, or where the graph contradicts the PRD's claims.

## Scope of "drift" — read carefully

The Intent graph models the *current architecture* — components, APIs, workflows, entities that exist in the codebase right now. PRDs additionally carry content that is *intentionally* outside the graph by design. **Do NOT flag the following as drift:**

- Thesis, motivation, or positioning prose (e.g. "the cost was always there...", "PV is positioned as...")
- Anti-features / non-goals ("PV is not a wiki", "no GUI")
- Out-of-scope items (the PRD lists what we explicitly won't build)
- Roadmap or future work that hasn't shipped yet
- Bench numbers, metrics, or empirical results (these live in `experiments/`, not the graph)
- Meta-narrative about why the PRD itself exists
- Trivial stylistic synonyms ("single source of truth" vs "source of truth")

**DO flag** concrete divergences such as:

- The PRD claims a specific product capability or behavior exists, but no Intent node represents it
- A linked Intent's description directly contradicts a claim in the PRD section
- A genuine synonym pair where the PRD and graph use different terms for the same shipped feature
- A section claims a feature was shipped but doesn't link to the obvious Intent node that represents it (use `graph_concepts_unmentioned`)

Be conservative. When uncertain, leave arrays empty rather than producing speculative drift.

## Section 1/1: User story: signing out

### PRD content

As a logged-in user, I want to explicitly sign out to invalidate my
session — for example, when I'm on a shared device. After signing out,
my session token must no longer be accepted; subsequent requests with
it should fail with 401. Any short-lived refresh tokens should also be
rotated so they can't be replayed.

This story covers the full sign-out flow: clearing the server-side
session record, rotating refresh tokens, and the client-side discard.

### Linked Intents

- **REQ-AUTH-001** — Users sign in with email and password
  - description: Standard credential-based authentication.
  - tags: auth, login
- **API-AUTH-LOGIN** — POST /auth/login _(neighbor)_
  - description: Email + password login endpoint.
  - tags: auth, api
  - codemap: src/auth/login.ts
  - outgoing: implements → REQ-AUTH-001

### Question

1. Does the PRD section make concrete claims not represented in the linked Intents?
2. Do the linked Intents contradict any claim in the section?
3. Are there terms used differently between the section and Intents (synonyms)?

---

## Output format

Return a single JSON object with this shape:

```json
{
  "sections": [
    {
      "section": "<heading or 'whole-document'>",
      "missing_in_graph": [
        {"claim": "<paraphrased claim>", "evidence": "<line refs or quote>"}
      ],
      "contradictions": [
        {"intent": "<id>", "section_claim": "...", "conflict": "..."}
      ],
      "synonym_pairs": [
        {"prd_term": "...", "graph_term": "...", "graph_node": "<id>"}
      ],
      "graph_concepts_unmentioned": [
        {"intent": "<id>", "why_relevant": "..."}
      ]
    }
  ]
}
```

Empty arrays are fine. Do not emit speculation: leave fields empty if uncertain.

