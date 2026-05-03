#!/bin/bash
#
# Aggregate one task's results into runs/<task-id>/results.csv plus a stdout
# summary. Reads tasks/<task-id>/expected-files.txt for correctness scoring.
#
# Usage: ./aggregate.sh <task-id>

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
TASK_ID="${1:-}"
[[ -n "$TASK_ID" ]] || { echo "usage: $0 <task-id>" >&2; exit 1; }

TASK_DIR="$ROOT/tasks/$TASK_ID"
RUNS_DIR="$ROOT/runs/$TASK_ID"
[[ -d "$RUNS_DIR" ]] || { echo "no runs for $TASK_ID at $RUNS_DIR" >&2; exit 1; }

EXPECTED="$TASK_DIR/expected-files.txt"
REQUIRED_FILES=()
if [[ -f "$EXPECTED" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && REQUIRED_FILES+=("$line")
  done < "$EXPECTED"
fi

CSV="$RUNS_DIR/results.csv"
echo "task,condition,run,exit_code,tests,wall_seconds,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_cost_usd,tool_uses,changed_files,extra_files,missing_files" > "$CSV"

for COND_DIR in "$RUNS_DIR"/*/; do
  COND=$(basename "$COND_DIR")
  [[ "$COND" == "results.csv" ]] && continue
  for RUN_DIR in "$COND_DIR"run-*/; do
    [[ -d "$RUN_DIR" ]] || continue
    RUN=$(basename "$RUN_DIR")

    RESULT="$RUN_DIR/result.json"
    if [[ ! -s "$RESULT" ]]; then
      echo "$TASK_ID,$COND,$RUN,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA" >> "$CSV"
      continue
    fi

    EXIT_CODE=$(cat "$RUN_DIR/exit_code.txt" 2>/dev/null || echo NA)
    WALL=$(cat "$RUN_DIR/wall_seconds.txt" 2>/dev/null || echo NA)
    TOOL_USES=$(cat "$RUN_DIR/tool_use_count.txt" 2>/dev/null || echo NA)
    TESTS=$(cat "$RUN_DIR/tests.txt" 2>/dev/null || echo NA)

    IN_TOK=$(jq -r '.usage.input_tokens // "NA"'                "$RESULT")
    OUT_TOK=$(jq -r '.usage.output_tokens // "NA"'              "$RESULT")
    CACHE_R=$(jq -r '.usage.cache_read_input_tokens // "NA"'    "$RESULT")
    CACHE_C=$(jq -r '.usage.cache_creation_input_tokens // "NA"' "$RESULT")
    COST=$(jq    -r '.total_cost_usd // "NA"'                   "$RESULT")

    CHANGED_LIST=()
    if [[ -s "$RUN_DIR/changed_tracked.txt" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && CHANGED_LIST+=("$line")
      done < "$RUN_DIR/changed_tracked.txt"
    fi
    CHANGED_COUNT=${#CHANGED_LIST[@]}

    MISSING=0
    HIT=0
    for req in "${REQUIRED_FILES[@]}"; do
      hit=0
      for c in "${CHANGED_LIST[@]:-}"; do
        [[ "$c" == "$req" ]] && hit=1 && break
      done
      if [[ $hit -eq 1 ]]; then
        HIT=$((HIT+1))
      else
        MISSING=$((MISSING+1))
      fi
    done
    EXTRA=$((CHANGED_COUNT - HIT))

    echo "$TASK_ID,$COND,$RUN,$EXIT_CODE,$TESTS,$WALL,$IN_TOK,$OUT_TOK,$CACHE_R,$CACHE_C,$COST,$TOOL_USES,$CHANGED_COUNT,$EXTRA,$MISSING" >> "$CSV"
  done
done

echo
echo "=== task $TASK_ID — results.csv ==="
column -s, -t < "$CSV"
echo

echo "=== task $TASK_ID — averages per condition ==="
awk -F, '
NR==1 { next }
{
  cond=$2
  if ($7!="NA") { in_tok[cond]+=$7; out_tok[cond]+=$8; cache_r[cond]+=$9; cost[cond]+=$11; tool[cond]+=$12; wall[cond]+=$6; n[cond]++ }
  if ($5=="PASS") pass[cond]++
}
END {
  printf "%-12s %4s %8s %12s %12s %12s %12s %10s %10s\n", "condition", "n", "tests_ok", "avg_in_tok", "avg_out_tok", "avg_cache_r", "avg_cost_usd", "avg_tools", "avg_wall_s"
  for (c in n) {
    if (n[c]==0) continue
    printf "%-12s %4d %8d %12.0f %12.0f %12.0f %12.4f %10.1f %10.1f\n", c, n[c], (pass[c]?pass[c]:0), in_tok[c]/n[c], out_tok[c]/n[c], cache_r[c]/n[c], cost[c]/n[c], tool[c]/n[c], wall[c]/n[c]
  }
}' "$CSV"
