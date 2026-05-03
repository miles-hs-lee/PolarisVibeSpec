---
id: PRD-AUTH-PASSKEY-V2
title: Passwordless authentication via passkey
status: shipped
intents: [REQ-AUTH-001, API-AUTH-LOGIN]
---

# Passwordless authentication

## User story: passkey signin

As a returning user with a registered passkey on my device, I want to
sign in with a single biometric tap (Touch ID, Windows Hello) instead
of typing my email and password. The system verifies the passkey
signature server-side and issues a session token. No password is
exchanged or stored for users who have completed passkey registration.

When the user has both a password and a passkey on file, the passkey
flow is the default; the password fallback is only available if the
device has no registered passkey.

<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->
