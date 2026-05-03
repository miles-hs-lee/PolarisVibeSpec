---
name: pv
description: Use this skill when the user requests a code change OR a graph/spec maintenance action (add a node, bootstrap an existing repo onto PV, enrich an existing node, review a PR for intent drift) in a repository that has a .polaris/graph.json file. For code changes, run `pv changed` and `pv review --prompt` to detect drift between the change and the intent layer. For graph maintenance, run the corresponding `pv` subcommand with `--prompt` and follow the prompt it emits — read existing files, edit .polaris/graph.json, validate. Skip this skill for repositories without .polaris/, for tiny repos (<10 source files), or when the user is asking a question rather than requesting an action.
---

# Polaris Vibe Spec — agent skill

This repo has a Polaris Vibe Spec graph at `.polaris/graph.json` describing
its architecture, with a `pv` CLI on PATH for querying it. PV is a
repo-local intent traceability checker: when code changes, it
surfaces divergence between the change and the documented intent.

## PR review — drift gate

Before pushing, or when reviewing a PR:

```bash
pv changed origin/main
```

Returns structural findings:

| Finding | What to do |
|---|---|
| `orphan_added` (warn) | Run `pv add-file <node-id> <path>` to link the new file, or create a new Intent node first if it represents a new capability. |
| `broken_codemap` (error) | A removed file is still listed. Run `pv rm-file <node-id> <path>`. |
| `rename_codemap` (error) | A renamed file's codemap kept the old path. Run `pv rm-file` + `pv add-file`. |
| `linked_node` (info) | The change touches an Intent node; check whether its description or any referenced PRD section needs updating. |

For non-trivial behavior changes, also do the semantic review:

```bash
pv review origin/main --prompt > /tmp/review.md
```

Then read `/tmp/review.md` and follow its instructions. The prompt
asks you to identify:

- Intent descriptions that the diff has made stale
- New Intent nodes that should exist for newly-shipped capabilities
- PRD sections that contradict the new code
- Codemap links to add or remove

Apply each proposed patch via the matching command (`pv generate`,
`pv promote`, `pv add-file`, `pv link`) — after the user reviews.

## Graph maintenance — `--prompt` delegates to you

Several commands emit a structured prompt instead of doing the work
themselves. PV does not call an LLM API directly — your existing
tools (Read, Edit) are the LLM. The prompt gives you the schema,
the relevant context, and the specific task. Follow it, then run
`pv validate` and `pv export-all`.

| User says | You run |
|---|---|
| "Add a node for / spec out / capture as a requirement…" | `pv generate "<intent>" --prompt` |
| "Bootstrap this repo onto PV / scaffold the graph from code" | `pv bootstrap --prompt` |
| "Flesh out / improve / fill in node X / its description is empty" | `pv enrich <id> --prompt` |
| "I edited some `spec/` markdown — sync those changes back" | `pv promote` |
| "Apply my doc edits to the graph" | `pv promote` |
| "Rename node X to Y everywhere" | `pv rename <oldId> <newId>` |
| "Check whether my PRD still matches the graph" | `pv prd check` (or `pv prd check --prompt` for semantic review) |

When `pv promote` rejects a file, the user attempted a *structural*
change in markdown (id / type / domain / relations). Translate the
rejection into the right tool: `pv link` for relations, `pv generate
"<intent>" --prompt` to add a new node, or a direct graph.json edit
for type/domain. Don't keep retrying `pv promote` against the
rejected file — explain what's blocked and propose the alternative.

After following any prompt:

1. `pv validate` — must show 0 errors.
2. `pv export-all` — refreshes `spec/`.
3. Report which IDs you created or modified.

## Optional: focused context for a known node

If the user already knows which node they're touching:

- `pv impact <id>` — focused file set the change affects (with a
  `coverage` indicator: narrow / broad / global). Read the listed
  files to scope your work.
- `pv why <path>` — reverse lookup; "what does this file implement?".
- `pv ask "<free-form intent>"` — one-shot preamble that classifies
  the intent, queries the graph, and runs `impact` on the top hit.
  Use it when starting from a description rather than a node id.

If `coverage` is `global`, the change is foundational; expect cascades
and cross-check with grep.

## Maintenance (only if your edit creates new source files)

If you create a new source file as part of a code change, run:

```bash
pv add-file <node-id> <new-file-path>
```

`pv changed` will catch missed entries at PR time, but linking
proactively saves a round-trip.
