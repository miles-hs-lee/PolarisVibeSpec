#!/bin/bash
#
# Reads runs/<condition>/run-<NN>/result.json and emits a CSV + a short
# stdout summary comparing token usage between conditions.

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
FIXTURE="$ROOT/fixtures/auth-api"

CSV="$ROOT/results.csv"
echo "condition,run,exit_code,wall_seconds,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_cost_usd,tool_uses,changed_files,extra_files,missing_files" > "$CSV"

# Expected file set for the lastLoginAt task (used for correctness scoring).
# The task touches the User entity and the login handler, at minimum.
REQUIRED_FILES=("src/users/user.js" "src/auth/login.js")

for COND_DIR in "$ROOT"/runs/*/; do
  COND=$(basename "$COND_DIR")
  for RUN_DIR in "$COND_DIR"run-*/; do
    [[ -d "$RUN_DIR" ]] || continue
    RUN=$(basename "$RUN_DIR")

    RESULT="$RUN_DIR/result.json"
    if [[ ! -s "$RESULT" ]]; then
      echo "$COND,$RUN,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA,NA" >> "$CSV"
      continue
    fi

    EXIT_CODE=$(cat "$RUN_DIR/exit_code.txt" 2>/dev/null || echo NA)
    WALL=$(cat "$RUN_DIR/wall_seconds.txt" 2>/dev/null || echo NA)
    TOOL_USES=$(cat "$RUN_DIR/tool_use_count.txt" 2>/dev/null || echo NA)

    IN_TOK=$(jq -r '.usage.input_tokens // "NA"'                     "$RESULT")
    OUT_TOK=$(jq -r '.usage.output_tokens // "NA"'                   "$RESULT")
    CACHE_R=$(jq -r '.usage.cache_read_input_tokens // "NA"'         "$RESULT")
    CACHE_C=$(jq -r '.usage.cache_creation_input_tokens // "NA"'     "$RESULT")
    COST=$(jq    -r '.total_cost_usd // "NA"'                        "$RESULT")

    # Correctness scoring: tracked-changed files vs required set.
    CHANGED_LIST=()
    if [[ -s "$RUN_DIR/changed_tracked.txt" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && CHANGED_LIST+=("$line")
      done < "$RUN_DIR/changed_tracked.txt"
    fi
    CHANGED_COUNT=${#CHANGED_LIST[@]}

    MISSING=0
    for req in "${REQUIRED_FILES[@]}"; do
      hit=0
      for c in "${CHANGED_LIST[@]:-}"; do
        [[ "$c" == "$req" ]] && hit=1 && break
      done
      [[ $hit -eq 0 ]] && MISSING=$((MISSING+1))
    done
    EXTRA=$((CHANGED_COUNT - (${#REQUIRED_FILES[@]} - MISSING)))

    echo "$COND,$RUN,$EXIT_CODE,$WALL,$IN_TOK,$OUT_TOK,$CACHE_R,$CACHE_C,$COST,$TOOL_USES,$CHANGED_COUNT,$EXTRA,$MISSING" >> "$CSV"
  done
done

echo
echo "=== results.csv ==="
column -s, -t < "$CSV"
echo

# Totals + averages per condition.
echo "=== averages per condition ==="
awk -F, '
NR==1 { next }
{
  cond=$1
  if ($5!="NA") { in_tok[cond]+=$5; out_tok[cond]+=$6; cache_r[cond]+=$7; cost[cond]+=$9; tool[cond]+=$10; wall[cond]+=$4; n[cond]++ }
}
END {
  printf "%-12s %6s %12s %12s %12s %12s %10s %10s\n", "condition", "n", "avg_in_tok", "avg_out_tok", "avg_cache_r", "avg_cost_usd", "avg_tools", "avg_wall_s"
  for (c in n) {
    if (n[c]==0) continue
    printf "%-12s %6d %12.0f %12.0f %12.0f %12.4f %10.1f %10.1f\n", c, n[c], in_tok[c]/n[c], out_tok[c]/n[c], cache_r[c]/n[c], cost[c]/n[c], tool[c]/n[c], wall[c]/n[c]
  }
}' "$CSV"
