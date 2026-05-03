# Scenario B: behavior change but description is stale.
# Code switches from password-based to passkey-based auth, but the
# Intent description still says "email + password". Expected:
# `intent_description_update` patch.

scenario_init() {
  mkdir -p .polaris docs/prd src/auth
  cat > .polaris/graph.json <<'EOF'
{"version":1,"nodes":{
  "REQ-AUTH-001":{"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"Email + password login","description":"Users sign in with their email address and a password. The password is verified against a stored bcrypt hash. On success a session token is issued. Username login is not supported.","tags":["auth","password"],"relations":[],"createdAt":"2026-01-01T00:00:00.000Z"},
  "API-AUTH-LOGIN":{"id":"API-AUTH-LOGIN","type":"api","domain":"AUTH","title":"POST /auth/login","description":"Accepts {email, password}. Verifies password against bcrypt hash. Returns session token.","tags":["auth"],"relations":[{"type":"implements","target":"REQ-AUTH-001"}],"createdAt":"2026-01-01T00:00:00.000Z"}
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

Users provide their email address and password. The system verifies the password and issues a session token.

<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->
EOF
  cat > src/auth/login.ts <<'EOF'
export async function login(email: string, password: string) {
  const user = await findUser(email);
  if (!user) throw new Error('invalid credentials');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Error('invalid credentials');
  return issueToken(user.id);
}
EOF
}

scenario_drift() {
  # Replace password verification with passkey signature verification.
  # Same endpoint, same node mapping, but behavior fundamentally changed.
  cat > src/auth/login.ts <<'EOF'
export async function login(email: string, passkeyAssertion: string) {
  const user = await findUser(email);
  if (!user) throw new Error('invalid credentials');
  const ok = await verifyPasskeySignature(user.public_key, passkeyAssertion);
  if (!ok) throw new Error('invalid passkey');
  return issueToken(user.id);
}
EOF
}
