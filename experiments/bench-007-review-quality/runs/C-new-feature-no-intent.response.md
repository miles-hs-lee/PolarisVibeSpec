```json
{
  "patches": [
    {
      "type": "new_intent_node",
      "proposed_id": "API-AUTH-PASSKEY-REGISTER",
      "proposed_type": "api",
      "proposed_domain": "AUTH",
      "proposed_title": "POST /auth/passkey/register",
      "proposed_description": "Accepts a WebAuthn assertion, verifies the attestation, stores the resulting public key against the user record, and returns success.",
      "reason": "New file src/auth/passkey-register.ts implements a passkey registration endpoint distinct from email/password login (see header comment 'POST /auth/passkey/register' and the registerPasskey function)."
    },
    {
      "type": "codemap_link",
      "node": "API-AUTH-LOGIN",
      "file": "src/auth/passkey-register.ts",
      "operation": "remove",
      "reason": "The codemap diff links passkey-register.ts to API-AUTH-LOGIN, but that node describes POST /auth/login with email+password; the new file is a separate passkey-registration endpoint and should instead link to a new API-AUTH-PASSKEY-REGISTER node."
    },
    {
      "type": "prd_section_update",
      "prd_path": "docs/prd/CORE.md",
      "section": "Story: signing in",
      "issue": "The PRD states users authenticate with email and password, but the codebase now also supports passkey (WebAuthn) registration, suggesting an additional auth method that the narrative does not mention.",
      "proposed_action": "Extend the signing-in story (or add a sibling section) to describe passkey registration/authentication as a supported method alongside email + password."
    }
  ],
  "summary": "This PR adds a new passkey registration endpoint (src/auth/passkey-register.ts) that verifies a WebAuthn attestation and stores a public key against a user — a genuinely new behavior, not a refactor. The intent layer needs a new API node (API-AUTH-PASSKEY-REGISTER) because the file was incorrectly attached to API-AUTH-LOGIN (email+password login) in the codemap, which is a different endpoint. The existing 'Story: signing in' PRD section, which describes only email+password auth, should be updated or extended to acknowledge passkeys as an additional authentication path."
}
```

The diff introduces a brand-new endpoint (`registerPasskey`) for WebAuthn-based passkey registration, which is clearly new behavior rather than a refactor, so patches are warranted. The codemap incorrectly attaches the new file to `API-AUTH-LOGIN`, whose description ("POST /auth/login… {email, password}") doesn't cover passkey registration, so I propose a new API node and a codemap correction. The linked PRD section ("Story: signing in") asserts email+password as the auth method, which now drifts from reality and warrants a narrative update. I avoided speculative patches about storage entities or the `verifyAttestation`/`storePublicKey` helpers since they aren't visible in the diff.

---
**Tokens used:** ~28,287 input. **Latency:** 20.0s.
