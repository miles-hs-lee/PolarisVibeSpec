#!/bin/bash
#
# Bench-003 — measure how PV behaves on a stale graph.
#
# Reuses the bench-002 multi-domain fixture and the same
# 01-subscription-currency task. For each (scenario, run) pair:
#   1. Reset fixture to baseline-state.
#   2. Overwrite .polaris/{graph,codemap}.json with the scenario's
#      drift-injected versions.
#   3. Drop the with-pv-v3 CLAUDE.md into fixture.
#   4. Run `claude -p` non-interactively against the task.
#   5. Score required-files-missed (the task requires editing
#      subscribe.js, which scenarios B/C/D hide from PV's output).
#
# Usage: ./run.sh [N]   (N = runs per scenario; default 2)

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
FIXTURE="$ROOT/../bench-002/fixtures/multi-domain"
TASK_FILE="$ROOT/../bench-002/tasks/01-subscription-currency/prompt.txt"
EXPECTED_FILE="$ROOT/../bench-002/tasks/01-subscription-currency/expected-files.txt"
CLAUDE="$ROOT/../bench-001/node_modules/.bin/claude"
PV_BIN_DIR="$ROOT/bin"

N="${1:-2}"
SCENARIOS=("A-clean" "B-stale-codemap" "C-stale-relations" "D-multi-drift")

[[ -x "$CLAUDE" ]]    || { echo "missing $CLAUDE" >&2; exit 1; }
[[ -d "$FIXTURE" ]]   || { echo "missing fixture: $FIXTURE" >&2; exit 1; }
[[ -f "$TASK_FILE" ]] || { echo "missing task: $TASK_FILE" >&2; exit 1; }
git -C "$FIXTURE" rev-parse baseline-state >/dev/null \
  || { echo "fixture missing baseline-state tag" >&2; exit 1; }

TASK="$(cat "$TASK_FILE")"

for ((i=1; i<=N; i++)); do
  RUN_LABEL=$(printf "run-%02d" "$i")
  for SC in "${SCENARIOS[@]}"; do
    OUT_DIR="$ROOT/runs/$SC/$RUN_LABEL"
    mkdir -p "$OUT_DIR"

    echo
    echo "=========================================================="
    echo "[$SC][$RUN_LABEL] resetting fixture + injecting scenario…"
    echo "=========================================================="

    # 1) Reset fixture, then overwrite .polaris with scenario files.
    git -C "$FIXTURE" reset --hard baseline-state >/dev/null
    git -C "$FIXTURE" clean -fdx --exclude=node_modules >/dev/null
    cp "$ROOT/scenarios/$SC/graph.json"  "$FIXTURE/.polaris/graph.json"
    cp "$ROOT/scenarios/$SC/codemap.json" "$FIXTURE/.polaris/codemap.json"

    # 2) Drop with-pv-v3 CLAUDE.md.
    cp "$ROOT/conditions/with-pv-v3/CLAUDE.md" "$FIXTURE/CLAUDE.md"

    # 3) Invoke claude -p.
    SECONDS_START=$SECONDS
    set +e
    (
      cd "$FIXTURE"
      PATH="$PV_BIN_DIR:$PATH" "$CLAUDE" \
          -p "$TASK" \
          --output-format stream-json \
          --verbose \
          --model sonnet \
          --max-turns 25 \
          --max-budget-usd 0.50 \
          --permission-mode bypassPermissions \
          --no-session-persistence \
          > "$OUT_DIR/stream.jsonl" 2> "$OUT_DIR/stderr.log"
    )
    EXIT_CODE=$?
    set -e
    WALL=$((SECONDS - SECONDS_START))

    # 4) Extract result + diff + tool counts.
    if [[ -s "$OUT_DIR/stream.jsonl" ]]; then
      tail -n 50 "$OUT_DIR/stream.jsonl" \
        | grep -E '^\{"type":"result"' \
        | tail -n 1 > "$OUT_DIR/result.json" || true
    fi
    TOOL_USE_COUNT=$(grep -o '"type":"tool_use"' "$OUT_DIR/stream.jsonl" 2>/dev/null | wc -l | tr -d ' ')
    echo "$TOOL_USE_COUNT" > "$OUT_DIR/tool_use_count.txt"
    git -C "$FIXTURE" diff --name-only baseline-state -- . > "$OUT_DIR/changed_tracked.txt" || true
    echo "$EXIT_CODE" > "$OUT_DIR/exit_code.txt"
    echo "$WALL"      > "$OUT_DIR/wall_seconds.txt"

    # 5) Run all three test suites; record pass/fail.
    (
      cd "$FIXTURE"
      node test/auth.test.js >/dev/null 2>&1 && \
      node test/billing.test.js >/dev/null 2>&1 && \
      node test/orders.test.js >/dev/null 2>&1
    ) && echo PASS > "$OUT_DIR/tests.txt" || echo FAIL > "$OUT_DIR/tests.txt"

    TESTS=$(cat "$OUT_DIR/tests.txt")
    echo "[$SC][$RUN_LABEL] done — exit=$EXIT_CODE wall=${WALL}s tool_uses=$TOOL_USE_COUNT tests=$TESTS"
  done
done

echo
echo "All runs complete. Aggregating…"
"$ROOT/aggregate.sh"
