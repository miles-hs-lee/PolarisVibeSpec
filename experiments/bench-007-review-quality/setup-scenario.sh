#!/bin/bash
# Build a single scenario directory: a tmp git repo whose initial commit
# represents the "approved state" (graph + code + PRD aligned), and
# whose HEAD commit represents the PR with planted intent drift.
#
# Usage: bash setup-scenario.sh <scenario-name> <scenario-dir>
# Output: writes runs/<scenario-name>.prompt.md
#
# Each scenario script lives at scenarios/<name>.sh and is sourced.

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="$1"
SCRIPT="$HERE/scenarios/$NAME.sh"
PV_DIST="$HERE/../../dist/cli.js"

if [ ! -f "$SCRIPT" ]; then
  echo "no scenario script at $SCRIPT" >&2
  exit 1
fi
if [ ! -f "$PV_DIST" ]; then
  echo "build PV first: (cd ../.. && npm run build)" >&2
  exit 1
fi

DIR=$(mktemp -d "/tmp/pv-bench-007-$NAME-XXXXXX")
trap "rm -rf $DIR" EXIT

(
  cd "$DIR"
  git init -q
  git config user.email t@t
  git config user.name t

  # Run the scenario's two-phase build.
  source "$SCRIPT"

  scenario_init       # initial state — graph + code + PRD aligned
  git add -A && git commit -q -m initial

  scenario_drift      # PR-time changes that introduce drift
  git add -A && git commit -q -m "scenario PR"
)

# Generate the prompt.
mkdir -p "$HERE/runs"
(cd "$DIR" && node "$PV_DIST" review HEAD~1 --prompt) > "$HERE/runs/$NAME.prompt.md"

# Report size.
SIZE_BYTES=$(wc -c < "$HERE/runs/$NAME.prompt.md")
SIZE_LINES=$(wc -l < "$HERE/runs/$NAME.prompt.md")
echo "$NAME: $SIZE_LINES lines, $SIZE_BYTES bytes"
