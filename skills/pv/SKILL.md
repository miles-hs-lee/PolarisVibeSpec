---
name: pv
description: Use this skill when the user requests a code change OR a graph/spec maintenance action (add a node, bootstrap an existing repo onto PV, enrich an existing node) in a repository that has a .polaris/graph.json file. For code changes, run `pv ask "<intent>"` first and route on the classification.recommendation field. For graph maintenance, run the corresponding `pv` subcommand with `--prompt` and follow the prompt it emits — read existing files, edit .polaris/graph.json, validate. Skip this skill for repositories without .polaris/, for tiny repos (<10 source files), or when the user is asking a question rather than requesting an action.
---

# Polaris Vibe Spec — agent skill

This repo has a Polaris Vibe Spec graph at `.polaris/graph.json` describing
its architecture, with a `pv` CLI on PATH for querying it.

## Code changes — run `pv ask` first

```bash
pv ask "<your intent>" --minimal
```

| recommendation | What to do |
|---|---|
| `use_pv` | Read **only** the files in `files`. Do not grep the rest of the repo. |
| `use_grep` | Skip PV. Use `grep -rn` on the textual target. PV will not save tokens for this task shape. |
| `use_both` | Use `files` to scope, then grep within that set to confirm coverage. |

If `coverage` is `global` even when recommendation is `use_pv`, fall back to grep.

## Graph maintenance — `--prompt` delegates to you

Three commands emit a structured prompt instead of doing the work themselves.
PV does not call an LLM API directly — your existing tools (Read, Edit) are
the LLM. The prompt gives you the schema, the relevant context, and the
specific task. Follow it, then run `pv validate` and `pv export-all`.

| User says | You run |
|---|---|
| "Add a node for / spec out / capture as a requirement…" | `pv generate "<intent>" --prompt` |
| "Bootstrap this repo onto PV / scaffold the graph from code" | `pv bootstrap --prompt` |
| "Flesh out / improve / fill in node X / its description is empty" | `pv enrich <id> --prompt` |

After following any prompt:
1. `pv validate` — must show 0 errors.
2. `pv export-all` — refreshes `spec/`.
3. Report which IDs you created or modified.

## Why this matters (empirical)

Measured on a 37-file fixture across three task shapes:
- Scoped feature add: PV saves −47% tools, −17% cost
- Cross-domain refactor: PV saves −44% tools, −28% cost
- Pure rename: PV **costs** +44% tools, +65% cost vs plain grep

The `pv ask` classifier encodes this routing so you don't have to
reproduce the rules. Trust the recommendation.

## Maintenance (only if your edit creates new source files)

If you create a new source file, run:

```bash
pv add-file <node-id> <new-file-path>
```

Otherwise no action needed — graph and codemap are pre-populated.
