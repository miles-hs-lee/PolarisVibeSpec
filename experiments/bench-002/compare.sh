#!/bin/bash
# Combine per-task results into a cross-task comparison report.

set -euo pipefail
cd "$(dirname "$0")"

ALL="$(pwd)/runs/all-tasks.csv"
echo "task,condition,n,tests_ok,avg_wall_s,avg_in_tok,avg_out_tok,avg_cache_r,avg_cost_usd,avg_tools" > "$ALL"

for TASK_DIR in runs/*/; do
  TASK=$(basename "$TASK_DIR")
  [[ "$TASK" == "all-tasks.csv" ]] && continue
  CSV="$TASK_DIR/results.csv"
  [[ -s "$CSV" ]] || continue
  awk -F, -v task="$TASK" '
    NR==1 { next }
    {
      cond=$2
      if ($7!="NA") { in_tok[cond]+=$7; out_tok[cond]+=$8; cache_r[cond]+=$9; cost[cond]+=$11; tool[cond]+=$12; wall[cond]+=$6; n[cond]++ }
      if ($5=="PASS") pass[cond]++
    }
    END {
      for (c in n) {
        if (n[c]==0) continue
        printf "%s,%s,%d,%d,%.1f,%.0f,%.0f,%.0f,%.4f,%.1f\n",
          task, c, n[c], (pass[c]?pass[c]:0), wall[c]/n[c], in_tok[c]/n[c], out_tok[c]/n[c], cache_r[c]/n[c], cost[c]/n[c], tool[c]/n[c]
      }
    }' "$CSV" >> "$ALL"
done

echo "=== all-tasks.csv (means per condition per task) ==="
column -s, -t < "$ALL"

echo
echo "=== with-pv vs without-pv deltas (negative = PV win) ==="
awk -F, '
NR==1 { next }
{
  key=$1
  if ($2=="with-pv") { wall_w[key]=$5; in_w[key]=$6; out_w[key]=$7; cache_w[key]=$8; cost_w[key]=$9; tool_w[key]=$10 }
  else                { wall_o[key]=$5; in_o[key]=$6; out_o[key]=$7; cache_o[key]=$8; cost_o[key]=$9; tool_o[key]=$10 }
  seen[key]=1
}
END {
  printf "%-30s %12s %12s %12s %12s %12s %12s\n", "task", "Δ_wall_%", "Δ_out_tok_%", "Δ_cache_r_%", "Δ_cost_%", "Δ_tools_%", "Δ_tools_abs"
  for (k in seen) {
    if (!(k in wall_w) || !(k in wall_o)) continue
    dw  = (wall_w[k]  - wall_o[k]) / wall_o[k]  * 100
    dot = (out_w[k]   - out_o[k])  / out_o[k]   * 100
    dca = (cache_w[k] - cache_o[k])/ cache_o[k] * 100
    dc  = (cost_w[k]  - cost_o[k]) / cost_o[k]  * 100
    dt  = (tool_w[k]  - tool_o[k]) / tool_o[k]  * 100
    dta = tool_w[k]   - tool_o[k]
    printf "%-30s %+12.1f %+12.1f %+12.1f %+12.1f %+12.1f %+12.1f\n", k, dw, dot, dca, dc, dt, dta
  }
}' "$ALL"
