---
id: PRD-AUTH-SESSION
title: Session lifecycle
status: shipped
intents: [REQ-AUTH-001, API-AUTH-LOGIN, API-AUTH-LOGOUT]
---

# Session lifecycle

## User story: signing out

As a logged-in user, I want to explicitly sign out to invalidate my
session — for example, when I'm on a shared device. After signing out,
my session token must no longer be accepted; subsequent requests with
it should fail with 401. Any short-lived refresh tokens should also be
rotated so they can't be replayed.

This story covers the full sign-out flow: clearing the server-side
session record, rotating refresh tokens, and the client-side discard.

<!-- pv-intents: REQ-AUTH-001 -->
