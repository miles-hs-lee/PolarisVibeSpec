---
name: pv
description: Use this skill when the user requests a code change in a repository that has a .polaris/graph.json file. Run `pv ask "<intent>"` first, then route on the classification.recommendation field — read impact.impacted_files for use_pv, run grep instead for use_grep, do both for use_both. Skip this skill for repositories without .polaris/, for tiny repos (<10 source files), or when the user is asking a question rather than requesting an edit.
---

# Polaris Vibe Spec — agent skill

This repo has a Polaris Vibe Spec graph at `.polaris/graph.json` describing
its architecture, with a `pv` CLI on PATH for querying it.

## Single rule

Before any code change, run:

```bash
pv ask "<your intent>" --minimal
```

Read `recommendation` and act accordingly:

| recommendation | What to do |
|---|---|
| `use_pv` | Read **only** the files in `files`. Do not grep the rest of the repo. |
| `use_grep` | Skip PV entirely. Use `grep -rn` on the textual target. PV will not save tokens for this task shape. |
| `use_both` | Use `files` to scope, then grep within that set to confirm coverage. |

If `coverage` is `global` even when recommendation is `use_pv`, the impact
set is too broad to narrow your search — fall back to grep.

## Why this matters (empirical)

Measured on a 37-file fixture across three task shapes:
- Scoped feature add: PV saves −47% tools, −17% cost
- Cross-domain refactor: PV saves −44% tools, −28% cost
- Pure rename: PV **costs** +44% tools, +65% cost vs plain grep

The `pv ask` classifier encodes this routing so you don't have to
reproduce the rules. Trust the recommendation.

## Maintenance (only if your edit changes graph state)

If you create a new source file, run:

```bash
pv add-file <node-id> <new-file-path>
```

Otherwise no action needed — the graph and codemap are pre-populated.
