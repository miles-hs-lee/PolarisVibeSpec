# Intent review: HEAD~1..HEAD

You are reviewing a code change to determine whether it implies updates to the Intent graph or PRD sections. The Intent graph captures *current architecture*; PRDs capture *intent narrative*. Code can change without intent shifting (refactors, perf), but it can also encode a new behavior or contradict an existing description — that's drift, and it's what this review catches.

Be conservative. Only propose patches when the code change clearly implies an intent-layer update. Pure refactors with no behavior change should produce zero patches.

## Structural findings (from `pv changed`)

- ℹ **linked_node** — src/auth/login.ts is linked to API-AUTH-LOGIN (1 PRD section reference it; review whether they need updates).

## Linked Intent + PRD context

### src/auth/login.ts _(modified)_

#### Linked to: `API-AUTH-LOGIN` — POST /auth/login

> Accepts {email, password}. Verifies password against bcrypt hash. Returns session token.

tags: `auth`

outgoing:
- implements → `REQ-AUTH-001` (Email + password login)

PRD sections (see appendix):
- §docs-prd-core-md--story-signing-in — **docs/prd/CORE.md** / "Story: signing in"

### PRD section bodies (referenced above by §anchor)

#### §docs-prd-core-md--story-signing-in
_docs/prd/CORE.md / "Story: signing in"_

```
Users provide their email address and password. The system verifies the password and issues a session token.
```

## Diff

```diff
diff --git a/src/auth/login.ts b/src/auth/login.ts
index 5be4b2c..0efeb04 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,7 +1,7 @@
-export async function login(email: string, password: string) {
+export async function login(email: string, passkeyAssertion: string) {
   const user = await findUser(email);
   if (!user) throw new Error('invalid credentials');
-  const ok = await bcrypt.compare(password, user.password_hash);
-  if (!ok) throw new Error('invalid credentials');
+  const ok = await verifyPasskeySignature(user.public_key, passkeyAssertion);
+  if (!ok) throw new Error('invalid passkey');
   return issueToken(user.id);
 }

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
