# Scenario D: PRD prose says X, code change makes it not-X.
# PRD says session tokens last 24 hours; code change shortens TTL
# to 1 hour without updating the PRD. Expected:
# `prd_section_update` patch.

scenario_init() {
  mkdir -p .polaris docs/prd src/auth
  cat > .polaris/graph.json <<'EOF'
{"version":1,"nodes":{
  "REQ-AUTH-001":{"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"Session-based login","description":"Users sign in and receive a session token.","tags":["auth","session"],"relations":[],"createdAt":"2026-01-01T00:00:00.000Z"},
  "API-AUTH-LOGIN":{"id":"API-AUTH-LOGIN","type":"api","domain":"AUTH","title":"POST /auth/login","description":"Issues a session token on successful credential check.","tags":["auth"],"relations":[{"type":"implements","target":"REQ-AUTH-001"}],"createdAt":"2026-01-01T00:00:00.000Z"}
}}
EOF
  cat > .polaris/codemap.json <<'EOF'
{"API-AUTH-LOGIN":["src/auth/login.ts","src/auth/session.ts"]}
EOF
  cat > docs/prd/CORE.md <<'EOF'
---
intents: [REQ-AUTH-001, API-AUTH-LOGIN]
---
# Auth PRD

## Story: signing in

After a successful sign-in, users receive a session token. The token is valid for **24 hours** so users don't have to sign in repeatedly throughout a workday. After expiry the user is redirected to the login screen.

<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->
EOF
  cat > src/auth/login.ts <<'EOF'
export async function login(email: string, password: string) {
  const user = await verify(email, password);
  return issueSession(user);
}
EOF
  cat > src/auth/session.ts <<'EOF'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function issueSession(user: User): Session {
  return {
    user_id: user.id,
    token: randomToken(),
    expires_at: Date.now() + SESSION_TTL_MS
  };
}
EOF
}

scenario_drift() {
  # Shorten the TTL to 1 hour without updating the PRD prose.
  cat > src/auth/session.ts <<'EOF'
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — shortened for security review

export function issueSession(user: User): Session {
  return {
    user_id: user.id,
    token: randomToken(),
    expires_at: Date.now() + SESSION_TTL_MS
  };
}
EOF
}
