```json
{
  "patches": [
    {
      "type": "intent_description_update",
      "node": "API-AUTH-LOGIN",
      "current_description": "Accepts {email, password}. Verifies password against bcrypt hash. Returns session token.",
      "proposed_description": "Accepts {email, passkeyAssertion}. Verifies the assertion against the user's stored public key. Returns session token.",
      "reason": "Diff replaces the `password` parameter and `bcrypt.compare(password, user.password_hash)` with `passkeyAssertion` and `verifyPasskeySignature(user.public_key, passkeyAssertion)`."
    },
    {
      "type": "intent_description_update",
      "node": "REQ-AUTH-001",
      "current_description": "Email + password login",
      "proposed_description": "Email + passkey login (WebAuthn-style assertion verified against the user's stored public key).",
      "reason": "API-AUTH-LOGIN implements REQ-AUTH-001, and the login function no longer accepts a password — it now verifies a passkey assertion."
    },
    {
      "type": "prd_section_update",
      "prd_path": "docs/prd/CORE.md",
      "section": "Story: signing in",
      "issue": "PRD says users provide email and password and that the system verifies the password, but login.ts now takes a passkey assertion and verifies a signature against a stored public key.",
      "proposed_action": "Rewrite the story to describe email + passkey assertion: users provide their email and a passkey assertion, the system verifies the assertion's signature against their stored public key, and issues a session token."
    }
  ],
  "summary": "This PR migrates the login flow from password (bcrypt) authentication to passkey-assertion authentication: the function signature changes from (email, password) to (email, passkeyAssertion), the bcrypt comparison is replaced with verifyPasskeySignature against user.public_key, and the failure message becomes 'invalid passkey'. This is a real behavior change, so the API-AUTH-LOGIN node description, the REQ-AUTH-001 requirement title, and the 'Story: signing in' PRD section all need updates to reflect passkey-based auth instead of password verification."
}
```

The diff is unambiguously a behavior change, not a refactor: the parameter name change from `password` to `passkeyAssertion`, the swap of `bcrypt.compare` for `verifyPasskeySignature`, and the use of `user.public_key` instead of `user.password_hash` together replace the entire authentication mechanism. All three linked intent artifacts (the API node description, the implemented requirement, and the PRD story) currently assert password verification, which directly contradicts the new code. I kept the patches tightly scoped to those three artifacts and did not propose new nodes or codemap edits, since the file linkage is unchanged. The conservative bar is met because each patch points to a specific contradicting line in the diff.

---
**Tokens used:** ~28,129 input. **Latency:** 19.4s.
