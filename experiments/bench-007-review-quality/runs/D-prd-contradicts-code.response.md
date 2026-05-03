```json
{
  "patches": [
    {
      "type": "prd_section_update",
      "prd_path": "docs/prd/CORE.md",
      "section": "Story: signing in",
      "issue": "PRD states the session token is valid for 24 hours, but src/auth/session.ts now sets SESSION_TTL_MS to 1 hour.",
      "proposed_action": "Update the duration in the 'Story: signing in' section from '24 hours' to '1 hour' (or the agreed new value), and reconcile the rationale ('so users don't have to sign in repeatedly throughout a workday') with the shortened TTL."
    }
  ],
  "summary": "The diff shortens SESSION_TTL_MS from 24h to 1h in src/auth/session.ts, which is a behavior change directly contradicting the linked PRD section in docs/prd/CORE.md that promises a 24-hour session token. The Intent graph node API-AUTH-LOGIN itself doesn't pin a duration in its description, so no node-description patch is needed, but the PRD narrative is now factually wrong and must be updated to match the new TTL."
}
```

The diff is a single-line constant change with a real behavior shift: session tokens now expire 24x faster. The linked PRD section explicitly cites "24 hours" and justifies it with workday convenience, so the code now contradicts the intent narrative — this is exactly the drift this review is meant to catch. The Intent node's description is generic ("Issues a session token on successful credential check") and doesn't encode the duration, so I'm not patching it; only the PRD section needs reconciliation. No new nodes or codemap edits are warranted.

---
**Tokens used:** ~27,628 input. **Latency:** 14.3s.
