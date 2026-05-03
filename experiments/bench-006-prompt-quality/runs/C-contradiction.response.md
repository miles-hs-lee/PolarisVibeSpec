```json
{
  "sections": [
    {
      "section": "User story: signing in with username",
      "missing_in_graph": [],
      "contradictions": [
        {
          "intent": "REQ-AUTH-001",
          "section_claim": "The username is the canonical login identifier; users sign in with username and password.",
          "conflict": "REQ-AUTH-001 states the email is the canonical identifier and usernames are explicitly NOT used as a login identifier."
        },
        {
          "intent": "API-AUTH-LOGIN",
          "section_claim": "The system looks up the user by username and accepts username as login input.",
          "conflict": "API-AUTH-LOGIN specifies the request body is {email, password} with email required and usernames not accepted."
        }
      ],
      "synonym_pairs": [],
      "graph_concepts_unmentioned": []
    }
  ]
}
```

The PRD section asserts username-based login as the canonical mechanism, while both linked Intents (REQ-AUTH-001 and API-AUTH-LOGIN) explicitly state the opposite — email is the canonical identifier and usernames are not accepted. These are direct, head-on contradictions rather than missing concepts or synonym mismatches, since the graph does represent the login feature, just with conflicting semantics. I left missing_in_graph empty because the login capability itself is represented in the graph. I left synonym_pairs empty because "username" vs "email" here are not synonyms for the same shipped feature — they refer to genuinely different identifiers, making this a contradiction rather than terminology drift.
