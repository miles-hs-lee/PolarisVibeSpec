# large-app project notes

Node.js multi-domain app (~85 files across auth, users, billing, orders,
notif, analytics). Before any code change, run `pv ask "<your intent>"`
first and follow the `classification.recommendation` field it returns
(`use_pv` reads `impact.impacted_files` only; `use_grep` skips PV;
`use_both` greps within the impact set).
