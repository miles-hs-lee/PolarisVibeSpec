#!/bin/bash
# Generate the Layer-3 drift-check prompt for each scenario.
# Each prompt is written to runs/<scenario>.prompt.md so it can be
# pasted into a coding agent (Claude Code, Codex, etc.) for evaluation.

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PV="$HERE/../../dist/cli.js"

if [ ! -f "$PV" ]; then
  echo "Build first: (cd ../.. && npm run build)" >&2
  exit 1
fi

mkdir -p "$HERE/runs"

for scenario in "$HERE/scenarios"/*/; do
  name=$(basename "$scenario")
  echo "→ generating prompt for $name"
  (cd "$scenario" && node "$PV" prd check ./prd.md --prompt) > "$HERE/runs/$name.prompt.md"
  echo "  wrote runs/$name.prompt.md ($(wc -l < "$HERE/runs/$name.prompt.md") lines)"
done

echo
echo "Next: pipe each runs/<scenario>.prompt.md into your coding agent"
echo "and save the response as runs/<scenario>.response.md."
echo "Then compare against scenarios/<name>/expected.md."
