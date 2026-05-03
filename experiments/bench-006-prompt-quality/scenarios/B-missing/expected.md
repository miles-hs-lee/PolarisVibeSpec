# Expected: B-missing

The PRD claims the product supports **passkey-based passwordless
signin** as a shipped capability. The graph models only password-based
login (REQ-AUTH-001 + API-AUTH-LOGIN). There is no Intent for passkey
signin, passkey registration, or biometric verification.

## Expected agent output

The agent should populate `missing_in_graph` for the passkey-related
claims. The exact wording will vary by run, but should include at
least:

- A claim about passkey-based signin (Touch ID / Windows Hello /
  biometric tap) not being represented by any Intent
- Possibly: a claim about passkey-vs-password preference order

```json
{
  "missing_in_graph": [
    {"claim": "passkey-based passwordless signin", "evidence": "..."}
  ],
  "contradictions": [],
  "synonym_pairs": [],
  "graph_concepts_unmentioned": []
}
```

## What this tests

- **Recall on shipped-but-unmodeled capability.** The most direct
  Layer 3 use case: the PM said we ship X, no Intent for X exists.
  Layer 1 can't catch this (no dangling reference, just no reference).
- **Avoidance of contradictions miscategorization.** This is a
  *missing* feature, not a contradiction. The agent should not
  populate `contradictions` here.
