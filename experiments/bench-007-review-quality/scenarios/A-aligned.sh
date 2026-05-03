# Scenario A: control — code change has no intent implications.
# A pure performance-style refactor of an internal helper. Expected
# agent output: patches=[].

scenario_init() {
  mkdir -p .polaris docs/prd src/auth
  cat > .polaris/graph.json <<'EOF'
{"version":1,"nodes":{
  "REQ-AUTH-001":{"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"Email + password login","description":"Users sign in with email and password. Password verified against stored hash.","tags":["auth"],"relations":[],"createdAt":"2026-01-01T00:00:00.000Z"},
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

Users authenticate with their email address and password. The system verifies the password against a stored bcrypt hash and issues a session token on success.

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
  # Pure refactor: extract the credential-check into a helper. No
  # behavior change, no intent implication.
  cat > src/auth/login.ts <<'EOF'
async function verifyCredentials(email: string, password: string) {
  const user = await findUser(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

export async function login(email: string, password: string) {
  const user = await verifyCredentials(email, password);
  if (!user) throw new Error('invalid credentials');
  return issueToken(user.id);
}
EOF
}
