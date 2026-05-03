```json
{
  "patches": [],
  "summary": "This PR is a pure refactor of src/auth/login.ts: the credential-checking logic is extracted into a private verifyCredentials helper, while login() retains identical external behavior (same signature, same thrown 'invalid credentials' error, same token issuance via issueToken(user.id)). The bcrypt-hash verification and email+password contract described in API-AUTH-LOGIN, REQ-AUTH-001, and the 'Story: signing in' PRD section all still hold exactly as written. No intent-layer updates are needed."
}
```

The diff only restructures the internal control flow: the user lookup and bcrypt comparison move into a helper that returns `null` on failure, and `login()` translates that `null` back into the same `'invalid credentials'` error it always threw. The public API, error semantics, and token issuance are unchanged, so API-AUTH-LOGIN's description, the REQ-AUTH-001 implementation link, and the PRD narrative about bcrypt verification and session tokens all remain accurate. The codemap link from src/auth/login.ts to API-AUTH-LOGIN is still correct since the file still implements that endpoint. Per the "Be conservative" guidance, this is exactly the refactor case that should produce zero patches.

---
**Tokens used:** ~27,610 input. **Latency:** 12.5s.
