# Expected: D-unlinked

The PRD section discusses the **sign-out flow** in detail: server-side
session record cleared, refresh tokens rotated, etc. The graph models
this exactly — `API-AUTH-LOGOUT` exists with a description that
matches almost word-for-word ("Invalidates the current session token.
Clears server-side session record and rotates any short-lived refresh
tokens.").

But the section directive only links REQ-AUTH-001 (general login req).
It misses both API-AUTH-LOGIN and the directly-relevant
API-AUTH-LOGOUT.

Frontmatter `intents:` does include API-AUTH-LOGOUT — the global
summary is correct — so this isn't a Layer 1 dangling/missing
problem. It's a Layer 3 *section-level link omission*.

## Expected agent output

```json
{
  "missing_in_graph": [],
  "contradictions": [],
  "synonym_pairs": [],
  "graph_concepts_unmentioned": [
    {"intent": "API-AUTH-LOGOUT", "why_relevant": "section is entirely about the logout flow and graph has API-AUTH-LOGOUT shipped, but section directive doesn't link it"}
  ]
}
```

## What this tests

- **Recall on unlinked-but-relevant Intent.** The hardest of the four
  scenarios. Requires the agent to (a) read the section's claims,
  (b) note the linked Intents don't cover it, (c) recognize from the
  available context that another Intent does cover it, (d) emit it
  in `graph_concepts_unmentioned`.
- **Use of frontmatter context.** A clever agent might note that
  the *frontmatter* listing already includes API-AUTH-LOGOUT,
  strengthening the case that the section just forgot the link.
