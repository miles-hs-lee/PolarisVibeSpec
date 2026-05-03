#!/bin/bash
#
# Bench-001 measurement loop. For each (condition, run) pair we:
#   1. Reset the fixture to the baseline-state tag (atomic; no leftovers)
#   2. Drop in the condition-specific CLAUDE.md
#   3. Optionally expose the `pv` shim on PATH (with-pv only)
#   4. Run `claude -p` non-interactively against the task
#   5. Capture the stream-json output, the final result, and the git diff
#
# Usage: ./run.sh [N]   (N = runs per condition; default 2)
#
# Outputs everything under runs/<condition>/run-<NN>/.

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
FIXTURE="$ROOT/fixtures/auth-api"
TASK_FILE="$ROOT/task.txt"
CLAUDE="$ROOT/node_modules/.bin/claude"
PV_BIN_DIR="$ROOT/bin"

N="${1:-2}"
CONDITIONS=("with-pv" "without-pv")

# Sanity checks.
[[ -x "$CLAUDE" ]]    || { echo "missing $CLAUDE — run: npm install --no-save @anthropic-ai/claude-code" >&2; exit 1; }
[[ -d "$FIXTURE" ]]   || { echo "missing fixture: $FIXTURE" >&2; exit 1; }
[[ -f "$TASK_FILE" ]] || { echo "missing task: $TASK_FILE" >&2; exit 1; }
git -C "$FIXTURE" rev-parse baseline-state >/dev/null \
  || { echo "fixture missing baseline-state tag" >&2; exit 1; }

TASK="$(cat "$TASK_FILE")"
mkdir -p "$ROOT/runs"

# Interleave runs so prompt-cache effects (5min TTL) don't favor one
# condition over the other: with-pv/run-01, without-pv/run-01, with-pv/run-02, ...
for ((i=1; i<=N; i++)); do
  RUN_LABEL=$(printf "run-%02d" "$i")
  for COND in "${CONDITIONS[@]}"; do
    OUT_DIR="$ROOT/runs/$COND/$RUN_LABEL"
    mkdir -p "$OUT_DIR"

    echo
    echo "=========================================================="
    echo "[$COND][$RUN_LABEL] resetting fixture and running claude…"
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
      RUN_PATH="$PATH"   # pv NOT available
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

    # 5) Extract the final `result` event and the modified-file list.
    if [[ -s "$OUT_DIR/stream.jsonl" ]]; then
      tail -n 50 "$OUT_DIR/stream.jsonl" \
        | grep -E '^\{"type":"result"' \
        | tail -n 1 > "$OUT_DIR/result.json" || true
    fi
    # Tool-use call count: scan assistant messages for tool_use blocks.
    TOOL_USE_COUNT=$(grep -o '"type":"tool_use"' "$OUT_DIR/stream.jsonl" 2>/dev/null | wc -l | tr -d ' ')
    echo "$TOOL_USE_COUNT" > "$OUT_DIR/tool_use_count.txt"

    # Capture changed-file set (relative to fixture root).
    git -C "$FIXTURE" diff --name-only baseline-state -- . > "$OUT_DIR/changed_tracked.txt" || true
    git -C "$FIXTURE" ls-files --others --exclude-standard > "$OUT_DIR/changed_untracked.txt" || true

    echo "$EXIT_CODE" > "$OUT_DIR/exit_code.txt"
    echo "$WALL"      > "$OUT_DIR/wall_seconds.txt"

    echo "[$COND][$RUN_LABEL] done — exit=$EXIT_CODE wall=${WALL}s tool_uses=$TOOL_USE_COUNT"
  done
done

echo
echo "All runs complete. Aggregating…"
"$ROOT/aggregate.sh"
