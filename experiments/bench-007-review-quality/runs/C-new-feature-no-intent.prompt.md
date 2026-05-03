# Intent review: HEAD~1..HEAD

You are reviewing a code change to determine whether it implies updates to the Intent graph or PRD sections. The Intent graph captures *current architecture*; PRDs capture *intent narrative*. Code can change without intent shifting (refactors, perf), but it can also encode a new behavior or contradict an existing description — that's drift, and it's what this review catches.

Be conservative. Only propose patches when the code change clearly implies an intent-layer update. Pure refactors with no behavior change should produce zero patches.

## Structural findings (from `pv changed`)

- ℹ **linked_node** — src/auth/passkey-register.ts is linked to API-AUTH-LOGIN (1 PRD section reference it; review whether they need updates).

## Linked Intent + PRD context

### src/auth/passkey-register.ts _(added)_

#### Linked to: `API-AUTH-LOGIN` — POST /auth/login

> Accepts {email, password}; returns session token.

tags: `auth`

outgoing:
- implements → `REQ-AUTH-001` (Email + password login)

PRD sections (see appendix):
- §docs-prd-core-md--story-signing-in — **docs/prd/CORE.md** / "Story: signing in"

### PRD section bodies (referenced above by §anchor)

#### §docs-prd-core-md--story-signing-in
_docs/prd/CORE.md / "Story: signing in"_

```
Users authenticate with email and password.
```

## Diff

```diff
diff --git a/.polaris/codemap.json b/.polaris/codemap.json
index fa7d163..dae8282 100644
--- a/.polaris/codemap.json
+++ b/.polaris/codemap.json
@@ -1 +1 @@
-{"API-AUTH-LOGIN":["src/auth/login.ts"]}
+{"API-AUTH-LOGIN":["src/auth/login.ts","src/auth/passkey-register.ts"]}
diff --git a/src/auth/passkey-register.ts b/src/auth/passkey-register.ts
new file mode 100644
index 0000000..d24ed7e
--- /dev/null
+++ b/src/auth/passkey-register.ts
@@ -0,0 +1,8 @@
+// POST /auth/passkey/register
+// Accepts an assertion from a WebAuthn ceremony, stores the public key
+// against the user record, and returns success.
+export async function registerPasskey(userId: string, assertion: string) {
+  const credential = await verifyAttestation(assertion);
+  await storePublicKey(userId, credential.publicKey);
+  return { ok: true };
+}

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
