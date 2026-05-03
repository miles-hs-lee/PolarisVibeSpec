```json
{
  "sections": [
    {
      "section": "User story: signing out",
      "missing_in_graph": [
        {"claim": "A sign-out flow exists that invalidates the server-side session record", "evidence": "lines 30-37"},
        {"claim": "Session tokens are rejected with 401 after sign-out", "evidence": "lines 32-34"},
        {"claim": "Refresh tokens are rotated on sign-out so they cannot be replayed", "evidence": "lines 33-34"},
        {"claim": "Client-side session token discard is part of the sign-out flow", "evidence": "lines 36-38"}
      ],
      "contradictions": [],
      "synonym_pairs": [],
      "graph_concepts_unmentioned": []
    }
  ]
}
```

The PRD section describes a complete sign-out flow (session invalidation, 401 rejection, refresh token rotation, client-side discard) but the linked Intents only cover login (REQ-AUTH-001 and API-AUTH-LOGIN). None of the linked nodes represent any sign-out, session invalidation, or refresh token rotation behavior, so the concrete shipped capabilities claimed by the section are not represented in the graph. I found no direct contradiction between the login-focused Intents and the sign-out claims, and no synonym pairs since there is no overlapping shipped feature term to compare. I left `graph_concepts_unmentioned` empty because I cannot see other graph nodes from this prompt alone — being conservative, I won't speculate about which sign-out Intent should have been linked.
