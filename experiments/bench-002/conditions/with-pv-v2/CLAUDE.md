# auth-api project notes

This is a small Node.js auth API.

## Polaris Vibe Spec is available — use `pv ask` first

This repo has a Polaris Vibe Spec graph at `.polaris/graph.json` and a
code map at `.polaris/codemap.json`. The `pv` CLI is on PATH.

**Before making any code change, run `pv ask "<your intent>"`**:

```bash
pv ask "your task description"
```

The output is a single JSON object with:
- `classification.recommendation`: `use_pv` | `use_grep` | `use_both`
- `classification.reason`: empirically derived rationale
- `hits`: ranked spec nodes that match your intent
- `impact`: full impact analysis on the top hit, including a `coverage`
  field: `narrow` | `broad` | `global`

**You MUST route on `classification.recommendation`**:

| recommendation | What to do |
|---|---|
| `use_pv` | Read **only** the files in `impact.impacted_files`. Do not grep the rest of the repo. |
| `use_grep` | **Skip PV entirely.** Use `grep -rn` on the textual target. PV will not save tokens for this task shape — bench data shows it adds 44–65% overhead vs grep on rename refactors. |
| `use_both` | Use `impact.impacted_files` to scope, then grep within that set to confirm coverage. |

Additional rule: if `impact.coverage` is `global` even when the
recommendation is `use_pv`, the impact set spans most of the graph and
will not narrow your search — fall back to grep.

After making changes, if you created new files, run
`pv add-file <node-id> <path>` to keep the codemap in sync.
