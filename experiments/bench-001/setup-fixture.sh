#!/bin/bash
# Re-init the bench-001 fixture as its own git repo + baseline-state tag.
# The fixture content is committed in this repo; we just need a local git
# state for run.sh to do `git reset --hard baseline-state` between runs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
FIX="$ROOT/fixtures/auth-api"
[[ -d "$FIX" ]] || { echo "missing $FIX" >&2; exit 1; }
cd "$FIX"
rm -rf .git
git init -b main >/dev/null 2>&1
git add . >/dev/null
git -c user.email=bench@local -c user.name=bench commit -q -m "fixture: auth-api baseline"
git tag baseline-state
echo "bench-001 fixture initialized at $FIX (tag: baseline-state)"
