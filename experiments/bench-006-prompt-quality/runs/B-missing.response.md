```json
{
  "sections": [
    {
      "section": "User story: passkey signin",
      "missing_in_graph": [
        {"claim": "Users can sign in via passkey with biometric tap (Touch ID, Windows Hello), with server-side passkey signature verification issuing a session token", "evidence": "lines 30-34"},
        {"claim": "When a user has both password and passkey, the passkey flow is the default and password is only a fallback when no passkey is registered on the device", "evidence": "lines 36-39"}
      ],
      "contradictions": [],
      "synonym_pairs": [],
      "graph_concepts_unmentioned": []
    }
  ]
}
```

The PRD section describes a passkey/WebAuthn signin flow as a shipped capability, but the only linked Intents (REQ-AUTH-001 and API-AUTH-LOGIN) cover email+password authentication. There is no Intent node representing passkey registration, biometric signin, signature verification, or the precedence rule between passkey and password. I flagged these as missing_in_graph rather than contradictions, since the password Intent does not directly deny passkey support — it simply does not represent it. No clear synonym pairs or unmentioned-but-relevant graph nodes appear in the provided context, so those arrays remain empty.
