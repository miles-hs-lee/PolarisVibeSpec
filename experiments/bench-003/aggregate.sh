#!/bin/bash
# Aggregate bench-003 runs into runs/results.csv plus a stdout summary
# with the central drift question: did the agent miss required files?

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
EXPECTED="$ROOT/../bench-002/tasks/01-subscription-currency/expected-files.txt"

REQUIRED_FILES=()
if [[ -f "$EXPECTED" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && REQUIRED_FILES+=("$line")
  done < "$EXPECTED"
fi

CSV="$ROOT/runs/results.csv"
mkdir -p "$ROOT/runs"
echo "scenario,run,exit_code,tests,wall_seconds,input_tokens,output_tokens,cache_read_tokens,total_cost_usd,tool_uses,changed_files,extra_files,missing_required" > "$CSV"

for SC_DIR in "$ROOT"/runs/*/; do
  SC=$(basename "$SC_DIR")
  [[ "$SC" == "results.csv" ]] && continue
  for RUN_DIR in "$SC_DIR"run-*/; do
    [[ -d "$RUN_DIR" ]] || continue
    RUN=$(basename "$RUN_DIR")

    RESULT="$RUN_DIR/result.json"
    if [[ ! -s "$RESULT" ]]; then
      echo "$SC,$RUN,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA" >> "$CSV"
      continue
    fi

    EXIT_CODE=$(cat "$RUN_DIR/exit_code.txt" 2>/dev/null || echo NA)
    WALL=$(cat "$RUN_DIR/wall_seconds.txt" 2>/dev/null || echo NA)
    TOOL_USES=$(cat "$RUN_DIR/tool_use_count.txt" 2>/dev/null || echo NA)
    TESTS=$(cat "$RUN_DIR/tests.txt" 2>/dev/null || echo NA)

    IN_TOK=$(jq -r '.usage.input_tokens // "NA"'                "$RESULT")
    OUT_TOK=$(jq -r '.usage.output_tokens // "NA"'              "$RESULT")
    CACHE_R=$(jq -r '.usage.cache_read_input_tokens // "NA"'    "$RESULT")
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
      [[ $hit -eq 1 ]] && HIT=$((HIT+1)) || MISSING=$((MISSING+1))
    done
    EXTRA=$((CHANGED_COUNT - HIT))

    echo "$SC,$RUN,$EXIT_CODE,$TESTS,$WALL,$IN_TOK,$OUT_TOK,$CACHE_R,$COST,$TOOL_USES,$CHANGED_COUNT,$EXTRA,$MISSING" >> "$CSV"
  done
done

echo
echo "=== bench-003 — results.csv ==="
column -s, -t < "$CSV"
echo
echo "=== averages per scenario ==="
awk -F, '
NR==1 { next }
{
  sc=$1
  if ($6!="NA") { in_tok[sc]+=$6; out_tok[sc]+=$7; cost[sc]+=$9; tool[sc]+=$10; wall[sc]+=$5; missing[sc]+=$13; n[sc]++ }
  if ($4=="PASS") pass[sc]++
}
END {
  printf "%-20s %4s %8s %12s %10s %14s %10s %10s\n", "scenario", "n", "tests_ok", "avg_missing_required", "avg_tools", "avg_cost_usd", "avg_wall_s", "avg_out_tok"
  for (sc in n) {
    if (n[sc]==0) continue
    printf "%-20s %4d %8d %12.2f %10.1f %14.4f %10.1f %10.0f\n",
      sc, n[sc], (pass[sc]?pass[sc]:0), missing[sc]/n[sc], tool[sc]/n[sc], cost[sc]/n[sc], wall[sc]/n[sc], out_tok[sc]/n[sc]
  }
}' "$CSV"
