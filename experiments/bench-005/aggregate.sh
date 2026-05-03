#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
EXPECTED="$ROOT/expected-files.txt"

REQUIRED_FILES=()
if [[ -f "$EXPECTED" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && REQUIRED_FILES+=("$line")
  done < "$EXPECTED"
fi

CSV="$ROOT/runs/results.csv"
mkdir -p "$ROOT/runs"
echo "condition,run,exit_code,tests,wall_seconds,input_tokens,output_tokens,cache_read_tokens,total_cost_usd,tool_uses,pv_invocations,changed_files,extra_files,missing_required" > "$CSV"

for COND_DIR in "$ROOT"/runs/*/; do
  COND=$(basename "$COND_DIR")
  [[ "$COND" == "results.csv" ]] && continue
  for RUN_DIR in "$COND_DIR"run-*/; do
    [[ -d "$RUN_DIR" ]] || continue
    RUN=$(basename "$RUN_DIR")

    RESULT="$RUN_DIR/result.json"
    if [[ ! -s "$RESULT" ]]; then
      echo "$COND,$RUN,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA" >> "$CSV"
      continue
    fi

    EXIT_CODE=$(cat "$RUN_DIR/exit_code.txt" 2>/dev/null || echo NA)
    WALL=$(cat "$RUN_DIR/wall_seconds.txt" 2>/dev/null || echo NA)
    TOOL_USES=$(cat "$RUN_DIR/tool_use_count.txt" 2>/dev/null || echo NA)
    PV=$(cat "$RUN_DIR/pv_invocations.txt" 2>/dev/null || echo NA)
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

    echo "$COND,$RUN,$EXIT_CODE,$TESTS,$WALL,$IN_TOK,$OUT_TOK,$CACHE_R,$COST,$TOOL_USES,$PV,$CHANGED_COUNT,$EXTRA,$MISSING" >> "$CSV"
  done
done

echo
echo "=== bench-004 — results.csv ==="
column -s, -t < "$CSV"
echo
echo "=== averages per condition ==="
awk -F, '
NR==1 { next }
{
  c=$1
  if ($6!="NA") { in_tok[c]+=$6; out_tok[c]+=$7; cost[c]+=$9; tool[c]+=$10; pv[c]+=$11; wall[c]+=$5; missing[c]+=$14; n[c]++ }
  if ($4=="PASS") pass[c]++
}
END {
  printf "%-18s %4s %8s %12s %10s %10s %12s %10s\n", "condition", "n", "tests_ok", "missing_req", "avg_tools", "avg_pv", "avg_cost_usd", "avg_wall_s"
  for (c in n) {
    if (n[c]==0) continue
    printf "%-18s %4d %8d %12.2f %10.1f %10.1f %12.4f %10.1f\n",
      c, n[c], (pass[c]?pass[c]:0), missing[c]/n[c], tool[c]/n[c], pv[c]/n[c], cost[c]/n[c], wall[c]/n[c]
  }
}' "$CSV"
