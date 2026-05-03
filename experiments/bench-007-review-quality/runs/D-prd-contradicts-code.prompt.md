# Intent review: HEAD~1..HEAD

You are reviewing a code change to determine whether it implies updates to the Intent graph or PRD sections. The Intent graph captures *current architecture*; PRDs capture *intent narrative*. Code can change without intent shifting (refactors, perf), but it can also encode a new behavior or contradict an existing description — that's drift, and it's what this review catches.

Be conservative. Only propose patches when the code change clearly implies an intent-layer update. Pure refactors with no behavior change should produce zero patches.

## Structural findings (from `pv changed`)

- ℹ **linked_node** — src/auth/session.ts is linked to API-AUTH-LOGIN (1 PRD section reference it; review whether they need updates).

## Linked Intent + PRD context

### src/auth/session.ts _(modified)_

#### Linked to: `API-AUTH-LOGIN` — POST /auth/login

> Issues a session token on successful credential check.

tags: `auth`

outgoing:
- implements → `REQ-AUTH-001` (Session-based login)

PRD sections (see appendix):
- §docs-prd-core-md--story-signing-in — **docs/prd/CORE.md** / "Story: signing in"

### PRD section bodies (referenced above by §anchor)

#### §docs-prd-core-md--story-signing-in
_docs/prd/CORE.md / "Story: signing in"_

```
After a successful sign-in, users receive a session token. The token is valid for **24 hours** so users don't have to sign in repeatedly throughout a workday. After expiry the user is redirected to the login screen.
```

## Diff

```diff
diff --git a/src/auth/session.ts b/src/auth/session.ts
index bbcfa3b..9da233b 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -1,4 +1,4 @@
-const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
+const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — shortened for security review
 
 export function issueSession(user: User): Session {
   return {

```

---

## Output format

Return a single JSON object with this shape. Empty `patches` is fine — *no patches* is the right answer for refactors with no behavior change.

```json
{
  "patches": [
    {
      "type": "intent_description_update",
      "node": "<id>",
      "current_description": "<excerpt>",
      "proposed_description": "<full new description>",
      "reason": "<one-sentence justification tied to a specific diff line>"
    },
    {
      "type": "new_intent_node",
      "proposed_id": "<TYPE>-<DOMAIN>-<SLUG>",
      "proposed_type": "requirement|api|workflow|entity",
      "proposed_domain": "<DOMAIN>",
      "proposed_title": "...",
      "proposed_description": "...",
      "reason": "..."
    },
    {
      "type": "prd_section_update",
      "prd_path": "...",
      "section": "<H2 heading>",
      "issue": "<what now contradicts the code>",
      "proposed_action": "<what to change>"
    },
    {
      "type": "codemap_link",
      "node": "<id>",
      "file": "<path>",
      "operation": "add|remove",
      "reason": "..."
    }
  ],
  "summary": "<one paragraph: what this PR is doing in intent terms, and what (if anything) the intent layer needs>"
}
```

Do not propose patches that are stylistic, defensive, or out of scope. If unsure, prefer `summary` text over a speculative patch.
