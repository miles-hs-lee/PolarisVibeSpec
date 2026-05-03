# large-app project notes

This is a Node.js multi-domain app: AUTH, USERS, BILLING, ORDERS,
NOTIF, ANALYTICS. ~85 source files split across `src/<domain>/`
directories with a shared `src/shared/` and a thin top-level
`server.js` / `router.js` / `index.js`.

Make code changes following the existing patterns in the repo.
