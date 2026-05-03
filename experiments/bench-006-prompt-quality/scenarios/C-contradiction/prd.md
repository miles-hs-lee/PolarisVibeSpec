---
id: PRD-AUTH-USERNAME
title: Username-based authentication
status: shipped
intents: [REQ-AUTH-001, API-AUTH-LOGIN]
---

# Username-based authentication

## User story: signing in with username

As a returning user, I want to enter my **username** (not my email) and
my password to access my account. The system looks up the user by
username, verifies the password against the stored hash, and issues a
session token.

The username is the canonical login identifier on this product. Email
addresses are stored for notifications but are not accepted as login
input.

<!-- pv-intents: REQ-AUTH-001, API-AUTH-LOGIN -->
