#!/bin/bash
# Bench-005 reuses the bench-004 large-app fixture but injects two
# cross-domain `affects` edges into the graph so the cancel API
# explicitly routes to analytics + notif. The whole point of this
# bench is to give PV a task whose right file set is *only* obvious
# from the graph, not from filenames.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_FIX="$ROOT/../bench-004/fixtures/large-app"
DST_FIX="$ROOT/fixtures/large-app"

[[ -d "$SRC_FIX" ]] || { echo "missing bench-004 fixture: $SRC_FIX" >&2; exit 1; }

rm -rf "$DST_FIX"
mkdir -p "$ROOT/fixtures"
cp -R "$SRC_FIX" "$DST_FIX"
rm -rf "$DST_FIX/.git"

# Patch the graph: add `affects` edges from API-BILLING-CANCEL to the
# analytics + notif entities. Without these, impact-of(API-BILLING-CANCEL)
# is billing-only. With these, it crosses into analytics + notif.
python3 - "$DST_FIX/.polaris/graph.json" <<'EOF'
import json, sys
path = sys.argv[1]
g = json.load(open(path))
node = g['nodes']['API-BILLING-CANCEL']
extras = [
    {"type": "affects", "target": "ENT-ANALYTICS-EVENT"},
    {"type": "affects", "target": "ENT-NOTIF-MESSAGE"}
]
existing = {(r['type'], r['target']) for r in node['relations']}
for r in extras:
    if (r['type'], r['target']) not in existing:
        node['relations'].append(r)
json.dump(g, open(path, 'w'), indent=2)
print(f"Patched: API-BILLING-CANCEL now has {len(node['relations'])} relations")
EOF

# Re-init git + baseline tag.
cd "$DST_FIX"
git init -b main >/dev/null 2>&1
git add . >/dev/null
git -c user.email=bench@local -c user.name=bench commit -q -m "fixture: large-app + cross-domain cancel edges"
git tag baseline-state

# Sanity: verify pv impact picks up the cross-domain set.
echo
echo "=== pv impact API-BILLING-CANCEL (should now reach analytics + notif) ==="
node /Users/cnt-22-70004/Documents/PolarisVibeSpec/dist/cli.js impact API-BILLING-CANCEL --pretty 2>&1 \
  | python3 -c "import sys, json; d = json.load(sys.stdin); print('nodes:', d['impacted_nodes']); print('files:', d['impacted_files'])"

echo
echo "Fixture initialized at $DST_FIX (tag: baseline-state)"
