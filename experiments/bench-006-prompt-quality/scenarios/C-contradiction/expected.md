# Expected: C-contradiction

The PRD says **username** is the canonical login identifier and that
emails are NOT accepted as login input. The linked Intents say the
exact opposite — REQ-AUTH-001's description states "email is the
canonical identifier; usernames are NOT used as a login identifier",
and API-AUTH-LOGIN's description says "the email field is required;
usernames are not accepted."

## Expected agent output

```json
{
  "missing_in_graph": [],
  "contradictions": [
    {"intent": "REQ-AUTH-001", "section_claim": "username is canonical, email not accepted", "conflict": "REQ-AUTH-001 explicitly says email is canonical, username not accepted"},
    {"intent": "API-AUTH-LOGIN", "section_claim": "username is the login input", "conflict": "API-AUTH-LOGIN body requires email, not username"}
  ],
  "synonym_pairs": [],
  "graph_concepts_unmentioned": []
}
```

The agent might collapse these into one item ("PRD claims username
login, graph specifies email login") — that still counts as a hit.

## What this tests

- **Recall on direct contradiction.** The most legible Layer 3 case:
  graph and PRD give incompatible specs.
- **Specificity over generality.** The agent should NOT mark this
  as `missing_in_graph` (the feature exists, it's just specified
  differently) and should NOT mark it as a synonym (these are
  genuinely different fields).
