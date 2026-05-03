#!/bin/bash
#
# Bench-002 measurement loop — multi-task aware.
#
# Usage: ./run.sh <task-id> [N]
#   task-id : a directory under ./tasks/ (e.g. 01-subscription-currency)
#   N       : runs per condition (default 2)
#
# Outputs go to runs/<task-id>/<condition>/run-<NN>/.

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
FIXTURE="$ROOT/fixtures/multi-domain"
CLAUDE="$ROOT/../bench-001/node_modules/.bin/claude"
PV_BIN_DIR="$ROOT/bin"

TASK_ID="${1:-}"
N="${2:-2}"
[[ -n "$TASK_ID" ]] || { echo "usage: $0 <task-id> [N]" >&2; exit 1; }

TASK_DIR="$ROOT/tasks/$TASK_ID"
PROMPT_FILE="$TASK_DIR/prompt.txt"
[[ -f "$PROMPT_FILE" ]] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

CONDITIONS=("with-pv" "without-pv")

# Sanity checks.
[[ -x "$CLAUDE" ]]   || { echo "missing $CLAUDE" >&2; exit 1; }
[[ -d "$FIXTURE" ]]  || { echo "missing fixture: $FIXTURE" >&2; exit 1; }
git -C "$FIXTURE" rev-parse baseline-state >/dev/null \
  || { echo "fixture missing baseline-state tag" >&2; exit 1; }

TASK="$(cat "$PROMPT_FILE")"

# Interleave runs so prompt-cache TTL effects don't bias one condition.
for ((i=1; i<=N; i++)); do
  RUN_LABEL=$(printf "run-%02d" "$i")
  for COND in "${CONDITIONS[@]}"; do
    OUT_DIR="$ROOT/runs/$TASK_ID/$COND/$RUN_LABEL"
    mkdir -p "$OUT_DIR"

    echo
    echo "=========================================================="
    echo "[$TASK_ID][$COND][$RUN_LABEL] resetting fixture and running claude…"
    echo "=========================================================="

    # 1) Reset fixture atomically.
    git -C "$FIXTURE" reset --hard baseline-state >/dev/null
    git -C "$FIXTURE" clean -fdx --exclude=node_modules >/dev/null

    # 2) Drop condition-specific CLAUDE.md into the fixture.
    cp "$ROOT/conditions/$COND/CLAUDE.md" "$FIXTURE/CLAUDE.md"

    # 3) PATH for the run.
    if [[ "$COND" == "with-pv" ]]; then
      RUN_PATH="$PV_BIN_DIR:$PATH"
    else
      RUN_PATH="$PATH"
    fi

    # 4) Invoke claude -p with cwd = fixture so CLAUDE.md auto-loads.
    SECONDS_START=$SECONDS
    set +e
    (
      cd "$FIXTURE"
      PATH="$RUN_PATH" "$CLAUDE" \
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

    # 5) Extract result + tool counts + diff.
    if [[ -s "$OUT_DIR/stream.jsonl" ]]; then
      tail -n 50 "$OUT_DIR/stream.jsonl" \
        | grep -E '^\{"type":"result"' \
        | tail -n 1 > "$OUT_DIR/result.json" || true
    fi
    TOOL_USE_COUNT=$(grep -o '"type":"tool_use"' "$OUT_DIR/stream.jsonl" 2>/dev/null | wc -l | tr -d ' ')
    echo "$TOOL_USE_COUNT" > "$OUT_DIR/tool_use_count.txt"
    git -C "$FIXTURE" diff --name-only baseline-state -- . > "$OUT_DIR/changed_tracked.txt" || true
    git -C "$FIXTURE" ls-files --others --exclude-standard > "$OUT_DIR/changed_untracked.txt" || true
    echo "$EXIT_CODE" > "$OUT_DIR/exit_code.txt"
    echo "$WALL"      > "$OUT_DIR/wall_seconds.txt"

    # 6) Run the fixture's tests against the modified state to verify the
    #    change actually works (correctness signal beyond just file diff).
    (
      cd "$FIXTURE"
      node test/auth.test.js >/dev/null 2>&1 && \
      node test/billing.test.js >/dev/null 2>&1 && \
      node test/orders.test.js >/dev/null 2>&1
    ) && echo PASS > "$OUT_DIR/tests.txt" || echo FAIL > "$OUT_DIR/tests.txt"

    TESTS=$(cat "$OUT_DIR/tests.txt")
    echo "[$TASK_ID][$COND][$RUN_LABEL] done — exit=$EXIT_CODE wall=${WALL}s tool_uses=$TOOL_USE_COUNT tests=$TESTS"
  done
done

echo
echo "All runs complete for task $TASK_ID. Aggregating…"
"$ROOT/aggregate.sh" "$TASK_ID"
