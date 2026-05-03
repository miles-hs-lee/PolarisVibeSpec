#!/bin/bash
# Generate .polaris/graph.json + codemap.json for the large-app fixture.
# Kept as a script so the graph stays reproducible and matches the
# hand-curated entity / API / workflow / requirement nodes that drive
# the bench-004 task.
set -euo pipefail
FIX="$(cd "$(dirname "$0")/.." && pwd)/fixtures/large-app"
[[ -d "$FIX" ]] || { echo "missing fixture: $FIX" >&2; exit 1; }
mkdir -p "$FIX/.polaris"

cat > "$FIX/.polaris/graph.json" <<'EOF'
{
  "version": 1,
  "nodes": {
    "REQ-AUTH-001":  {"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"User signup with email + password","description":"New users register and become active.","tags":["auth"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-AUTH-002":  {"id":"REQ-AUTH-002","type":"requirement","domain":"AUTH","title":"Login with credentials","description":"Authenticated requests use a session token.","tags":["auth"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-AUTH-USER": {"id":"ENT-AUTH-USER","type":"entity","domain":"AUTH","title":"User record","description":"id, email, passwordHash, createdAt, currency (added).","tags":["auth","user"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-AUTH-SESSION":{"id":"ENT-AUTH-SESSION","type":"entity","domain":"AUTH","title":"Session record","description":"token, userId, createdAt.","tags":["auth"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-SIGNUP":{"id":"API-AUTH-SIGNUP","type":"api","domain":"AUTH","title":"POST /auth/signup","description":"Create a new user.","tags":["auth"],"relations":[{"type":"implements","target":"REQ-AUTH-001"},{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-LOGIN":{"id":"API-AUTH-LOGIN","type":"api","domain":"AUTH","title":"POST /auth/login","description":"Verify credentials, issue session.","tags":["auth"],"relations":[{"type":"implements","target":"REQ-AUTH-002"},{"type":"uses","target":"ENT-AUTH-USER"},{"type":"uses","target":"ENT-AUTH-SESSION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-LOGOUT":{"id":"API-AUTH-LOGOUT","type":"api","domain":"AUTH","title":"POST /auth/logout","description":"End a session.","tags":["auth"],"relations":[{"type":"uses","target":"ENT-AUTH-SESSION"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "ENT-USERS-PROFILE":{"id":"ENT-USERS-PROFILE","type":"entity","domain":"USERS","title":"Profile","description":"User profile fields.","tags":["users"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-USERS-PROFILE-GET":{"id":"API-USERS-PROFILE-GET","type":"api","domain":"USERS","title":"GET /users/profile","description":"Return the user's profile.","tags":["users"],"relations":[{"type":"uses","target":"ENT-USERS-PROFILE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-USERS-PROFILE-UPDATE":{"id":"API-USERS-PROFILE-UPDATE","type":"api","domain":"USERS","title":"PATCH /users/profile","description":"Update the user's profile.","tags":["users"],"relations":[{"type":"uses","target":"ENT-USERS-PROFILE"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "REQ-BILLING-001":{"id":"REQ-BILLING-001","type":"requirement","domain":"BILLING","title":"Users can subscribe to plans","description":"Authenticated users can subscribe.","tags":["billing"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-BILLING-002":{"id":"REQ-BILLING-002","type":"requirement","domain":"BILLING","title":"Open invoices can be charged","description":"Charge user's open invoices.","tags":["billing"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-BILLING-003":{"id":"REQ-BILLING-003","type":"requirement","domain":"BILLING","title":"Paid invoices can be refunded","description":"Refund with a reason.","tags":["billing"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-BILLING-SUBSCRIPTION":{"id":"ENT-BILLING-SUBSCRIPTION","type":"entity","domain":"BILLING","title":"Subscription","description":"id, userId, planId, status, startedAt, cancelledAt.","tags":["billing"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-BILLING-INVOICE":{"id":"ENT-BILLING-INVOICE","type":"entity","domain":"BILLING","title":"Invoice","description":"id, userId, subscriptionId, amount, issuedAt, paid.","tags":["billing"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"},{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-SUBSCRIBE":{"id":"API-BILLING-SUBSCRIBE","type":"api","domain":"BILLING","title":"POST /billing/subscribe","description":"Create a subscription for a user.","tags":["billing"],"relations":[{"type":"implements","target":"REQ-BILLING-001"},{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"},{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-CHARGE":{"id":"API-BILLING-CHARGE","type":"api","domain":"BILLING","title":"POST /billing/charge","description":"Charge open invoices.","tags":["billing"],"relations":[{"type":"implements","target":"REQ-BILLING-002"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-REFUND":{"id":"API-BILLING-REFUND","type":"api","domain":"BILLING","title":"POST /billing/refund","description":"Refund an invoice.","tags":["billing"],"relations":[{"type":"implements","target":"REQ-BILLING-003"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-UPGRADE":{"id":"API-BILLING-UPGRADE","type":"api","domain":"BILLING","title":"POST /billing/upgrade","description":"Switch a subscription's plan.","tags":["billing"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-CANCEL":{"id":"API-BILLING-CANCEL","type":"api","domain":"BILLING","title":"POST /billing/cancel","description":"Cancel a subscription.","tags":["billing"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "WF-BILLING-INVOICE":{"id":"WF-BILLING-INVOICE","type":"workflow","domain":"BILLING","title":"Invoice generation flow","description":"Subscription → resolve plan → create invoice.","tags":["billing"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "REQ-ORDER-001":{"id":"REQ-ORDER-001","type":"requirement","domain":"ORDERS","title":"Users place orders via cart checkout","description":"Cart → checkout → Order.","tags":["orders"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-ORDER-CART":{"id":"ENT-ORDER-CART","type":"entity","domain":"ORDERS","title":"Cart","description":"Per-user cart items.","tags":["orders"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-ORDER-ORDER":{"id":"ENT-ORDER-ORDER","type":"entity","domain":"ORDERS","title":"Order","description":"id, userId, items, total, status.","tags":["orders"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ORDER-CHECKOUT":{"id":"API-ORDER-CHECKOUT","type":"api","domain":"ORDERS","title":"POST /orders/checkout","description":"Convert cart to order.","tags":["orders"],"relations":[{"type":"implements","target":"REQ-ORDER-001"},{"type":"uses","target":"ENT-ORDER-CART"},{"type":"uses","target":"ENT-ORDER-ORDER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ORDER-FULFILL":{"id":"API-ORDER-FULFILL","type":"api","domain":"ORDERS","title":"POST /orders/fulfill","description":"Mark order fulfilled.","tags":["orders"],"relations":[{"type":"uses","target":"ENT-ORDER-ORDER"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "ENT-NOTIF-MESSAGE":{"id":"ENT-NOTIF-MESSAGE","type":"entity","domain":"NOTIF","title":"Notification message","description":"channel, to, body, status.","tags":["notif"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-NOTIF-EMAIL":{"id":"API-NOTIF-EMAIL","type":"api","domain":"NOTIF","title":"sendEmail","description":"Enqueue an email notification.","tags":["notif"],"relations":[{"type":"uses","target":"ENT-NOTIF-MESSAGE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-NOTIF-SMS":{"id":"API-NOTIF-SMS","type":"api","domain":"NOTIF","title":"sendSms","description":"Enqueue an SMS notification.","tags":["notif"],"relations":[{"type":"uses","target":"ENT-NOTIF-MESSAGE"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "ENT-ANALYTICS-EVENT":{"id":"ENT-ANALYTICS-EVENT","type":"entity","domain":"ANALYTICS","title":"Event record","description":"Tracked user event.","tags":["analytics"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ANALYTICS-TRACK":{"id":"API-ANALYTICS-TRACK","type":"api","domain":"ANALYTICS","title":"track","description":"Record an event.","tags":["analytics"],"relations":[{"type":"uses","target":"ENT-ANALYTICS-EVENT"}],"createdAt":"2026-05-03T00:00:00.000Z"}
  }
}
EOF

cat > "$FIX/.polaris/codemap.json" <<'EOF'
{
  "ENT-AUTH-USER": ["src/users/user.js", "src/users/repository.js"],
  "ENT-AUTH-SESSION": ["src/auth/session.js"],
  "API-AUTH-SIGNUP": ["src/auth/signup.js", "src/router.js"],
  "API-AUTH-LOGIN": ["src/auth/login.js", "src/router.js"],
  "API-AUTH-LOGOUT": ["src/auth/logout.js", "src/router.js"],

  "ENT-USERS-PROFILE": ["src/users/profile.js"],
  "API-USERS-PROFILE-GET": ["src/users/profile.js"],
  "API-USERS-PROFILE-UPDATE": ["src/users/profile.js"],

  "ENT-BILLING-SUBSCRIPTION": ["src/billing/subscription.js", "src/billing/repository.js"],
  "ENT-BILLING-INVOICE": ["src/billing/invoice.js", "src/billing/repository.js"],
  "API-BILLING-SUBSCRIBE": ["src/billing/subscribe.js", "src/router.js"],
  "API-BILLING-CHARGE": ["src/billing/charge.js", "src/billing/payment.js", "src/router.js"],
  "API-BILLING-REFUND": ["src/billing/refund.js", "src/router.js"],
  "API-BILLING-UPGRADE": ["src/billing/upgrade.js"],
  "API-BILLING-CANCEL": ["src/billing/cancel.js", "src/billing/unsubscribe.js"],
  "WF-BILLING-INVOICE": ["src/billing/invoice.js", "src/billing/subscription.js"],

  "ENT-ORDER-CART": ["src/orders/cart.js"],
  "ENT-ORDER-ORDER": ["src/orders/order.js", "src/orders/repository.js"],
  "API-ORDER-CHECKOUT": ["src/orders/checkout.js", "src/orders/inventory.js", "src/orders/shipping.js", "src/router.js"],
  "API-ORDER-FULFILL": ["src/orders/fulfillment.js", "src/router.js"],

  "ENT-NOTIF-MESSAGE": ["src/notif/queue.js"],
  "API-NOTIF-EMAIL": ["src/notif/email.js", "src/notif/template.js"],
  "API-NOTIF-SMS": ["src/notif/sms.js"],

  "ENT-ANALYTICS-EVENT": ["src/analytics/event.js"],
  "API-ANALYTICS-TRACK": ["src/analytics/track.js", "src/analytics/event.js"]
}
EOF

# Re-tag baseline so the .polaris files are in the snapshot.
cd "$FIX"
git add .polaris/graph.json .polaris/codemap.json >/dev/null
git -c user.email=bench@local -c user.name=bench commit -q --amend --no-edit >/dev/null
git tag -d baseline-state >/dev/null 2>&1 || true
git tag baseline-state

echo "Graph + codemap written; baseline-state retagged."
node /Users/cnt-22-70004/Documents/PolarisVibeSpec/dist/cli.js validate --pretty 2>&1 | tail -8
