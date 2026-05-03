# Expected: A-aligned

This is the *control* scenario. The PRD's claim — "user signs in with
email and password, system verifies via hash, issues session token" —
is exactly modeled by REQ-AUTH-001 (description), API-AUTH-LOGIN
(endpoint + implements), and ENT-AUTH-USER (record with password_hash).

All three Intents are linked via the section directive. There is no
drift.

## Expected agent output

For Section 1/1 ("User story: signing in"), all four arrays should be
empty:

```json
{
  "missing_in_graph": [],
  "contradictions": [],
  "synonym_pairs": [],
  "graph_concepts_unmentioned": []
}
```

## What this tests

- **False-positive rate.** If the agent flags drift here, the prompt
  is producing hallucinations.
- **Schema adherence.** Empty-but-well-formed JSON is the cleanest
  control signal.
