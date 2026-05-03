#!/bin/bash
# Bench-005 — does the routing value show up on a task whose right
# file set is hidden in the graph (cross-domain) rather than visible
# in filenames? Same 86-file fixture as bench-004 but with two
# additional `affects` edges from API-BILLING-CANCEL into analytics
# and notif. Three conditions, N=2.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
FIXTURE="$ROOT/fixtures/large-app"
TASK_FILE="$ROOT/task.txt"
CLAUDE="$ROOT/../bench-001/node_modules/.bin/claude"
PV_BIN_DIR="$ROOT/bin"

N="${1:-2}"
if [[ -n "${CONDITIONS_OVERRIDE:-}" ]]; then
  read -ra CONDITIONS <<< "$CONDITIONS_OVERRIDE"
else
  CONDITIONS=("without-pv" "with-pv-v3" "with-pv-forced")
fi

[[ -x "$CLAUDE" ]]    || { echo "missing $CLAUDE" >&2; exit 1; }
[[ -d "$FIXTURE" ]]   || { echo "missing fixture: $FIXTURE — run setup-fixture.sh" >&2; exit 1; }
git -C "$FIXTURE" rev-parse baseline-state >/dev/null \
  || { echo "fixture missing baseline-state" >&2; exit 1; }

TASK="$(cat "$TASK_FILE")"

for ((i=1; i<=N; i++)); do
  RUN_LABEL=$(printf "run-%02d" "$i")
  for COND in "${CONDITIONS[@]}"; do
    OUT_DIR="$ROOT/runs/$COND/$RUN_LABEL"
    mkdir -p "$OUT_DIR"

    echo
    echo "=========================================================="
    echo "[$COND][$RUN_LABEL] resetting fixture and running claude…"
    echo "=========================================================="

    git -C "$FIXTURE" reset --hard baseline-state >/dev/null
    git -C "$FIXTURE" clean -fdx --exclude=node_modules >/dev/null
    cp "$ROOT/conditions/$COND/CLAUDE.md" "$FIXTURE/CLAUDE.md"

    if [[ "$COND" == "without-pv" ]]; then
      RUN_PATH="$PATH"
    else
      RUN_PATH="$PV_BIN_DIR:$PATH"
    fi

    SECONDS_START=$SECONDS
    set +e
    (
      cd "$FIXTURE"
      PATH="$RUN_PATH" "$CLAUDE" \
          -p "$TASK" \
          --output-format stream-json \
          --verbose \
          --model sonnet \
          --max-turns 30 \
          --max-budget-usd 0.60 \
          --permission-mode bypassPermissions \
          --no-session-persistence \
          > "$OUT_DIR/stream.jsonl" 2> "$OUT_DIR/stderr.log"
    )
    EXIT_CODE=$?
    set -e
    WALL=$((SECONDS - SECONDS_START))

    if [[ -s "$OUT_DIR/stream.jsonl" ]]; then
      tail -n 50 "$OUT_DIR/stream.jsonl" \
        | grep -E '^\{"type":"result"' \
        | tail -n 1 > "$OUT_DIR/result.json" || true
    fi
    TOOL_USE_COUNT=$(grep -o '"type":"tool_use"' "$OUT_DIR/stream.jsonl" 2>/dev/null | wc -l | tr -d ' ')
    PV_INVOKED=$(grep -c '"command":"pv ' "$OUT_DIR/stream.jsonl" 2>/dev/null || echo 0)
    echo "$TOOL_USE_COUNT" > "$OUT_DIR/tool_use_count.txt"
    echo "$PV_INVOKED"   > "$OUT_DIR/pv_invocations.txt"
    git -C "$FIXTURE" diff --name-only baseline-state -- . > "$OUT_DIR/changed_tracked.txt" || true
    echo "$EXIT_CODE" > "$OUT_DIR/exit_code.txt"
    echo "$WALL"      > "$OUT_DIR/wall_seconds.txt"

    (
      cd "$FIXTURE"
      node test/auth.test.js >/dev/null 2>&1 && \
      node test/billing.test.js >/dev/null 2>&1 && \
      node test/orders.test.js >/dev/null 2>&1 && \
      node test/notif.test.js >/dev/null 2>&1 && \
      node test/analytics.test.js >/dev/null 2>&1
    ) && echo PASS > "$OUT_DIR/tests.txt" || echo FAIL > "$OUT_DIR/tests.txt"

    TESTS=$(cat "$OUT_DIR/tests.txt")
    echo "[$COND][$RUN_LABEL] done — exit=$EXIT_CODE wall=${WALL}s tools=$TOOL_USE_COUNT pv=$PV_INVOKED tests=$TESTS"
  done
done

echo
echo "All runs complete. Aggregating…"
"$ROOT/aggregate.sh"
