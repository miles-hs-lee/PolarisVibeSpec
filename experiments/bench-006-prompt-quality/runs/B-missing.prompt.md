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

## Section 1/1: User story: passkey signin

### PRD content

As a returning user with a registered passkey on my device, I want to
sign in with a single biometric tap (Touch ID, Windows Hello) instead
of typing my email and password. The system verifies the passkey
signature server-side and issues a session token. No password is
exchanged or stored for users who have completed passkey registration.

When the user has both a password and a passkey on file, the passkey
flow is the default; the password fallback is only available if the
device has no registered passkey.

### Linked Intents

- **REQ-AUTH-001** — Users can sign in with email and password
  - description: Standard credential-based authentication. Email + password verified against a stored hash.
  - tags: auth, login
- **API-AUTH-LOGIN** — POST /auth/login _(neighbor)_
  - description: Accepts email + password, returns a session token on success.
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

