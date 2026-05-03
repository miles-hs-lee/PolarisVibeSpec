# Scenario C: new feature shipped, no Intent node added.
# Code adds a brand new endpoint (POST /auth/passkey/register) and
# its supporting file. No corresponding Intent node was created in
# graph.json — the developer forgot. The new file is added to
# codemap of an existing API node (API-AUTH-LOGIN), which is the
# wrong owner. Expected: `new_intent_node` patch proposing
# API-AUTH-PASSKEY-REGISTER (or similar).

scenario_init() {
  mkdir -p .polaris docs/prd src/auth
  cat > .polaris/graph.json <<'EOF'
{"version":1,"nodes":{
  "REQ-AUTH-001":{"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"Email + password login","description":"Users sign in with email and password.","tags":["auth"],"relations":[],"createdAt":"2026-01-01T00:00:00.000Z"},
  "API-AUTH-LOGIN":{"id":"API-AUTH-LOGIN","type":"api","domain":"AUTH","title":"POST /auth/login","description":"Accepts {email, password}; returns session token.","tags":["auth"],"relations":[{"type":"implements","target":"REQ-AUTH-001"}],"createdAt":"2026-01-01T00:00:00.000Z"}
}}
EOF
  cat > .polaris/codemap.json <<'EOF'
{"API-AUTH-LOGIN":["src/auth/login.ts"]}
EOF
  cat > docs/prd/CORE.md <<'EOF'
---
intents: [REQ-AUTH-001, API-AUTH-LOGIN]
---
# Auth PRD

## Story: signing in

Users authenticate with email and password.

<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->
EOF
  cat > src/auth/login.ts <<'EOF'
export async function login(email: string, password: string) {
  // ... password verification ...
  return issueToken();
}
EOF
}

scenario_drift() {
  # Add a passkey-registration endpoint as a new file. Update codemap
  # to attach it to API-AUTH-LOGIN — wrong owner. No new Intent for
  # the registration capability.
  cat > src/auth/passkey-register.ts <<'EOF'
// POST /auth/passkey/register
// Accepts an assertion from a WebAuthn ceremony, stores the public key
// against the user record, and returns success.
export async function registerPasskey(userId: string, assertion: string) {
  const credential = await verifyAttestation(assertion);
  await storePublicKey(userId, credential.publicKey);
  return { ok: true };
}
EOF
  # Wrong codemap update — points at API-AUTH-LOGIN.
  cat > .polaris/codemap.json <<'EOF'
{"API-AUTH-LOGIN":["src/auth/login.ts","src/auth/passkey-register.ts"]}
EOF
}
