# auth-api project notes

This is a small Node.js auth API.

## Polaris Vibe Spec is available

This repo has a **Polaris Vibe Spec graph** at `.polaris/graph.json` and a
code map at `.polaris/codemap.json`. The `pv` CLI is installed and on PATH.

**Before making any code change, you MUST**:

1. Run `pv query "<keyword>"` to find spec nodes related to the change.
2. Run `pv impact <id>` for the most relevant node id. The output's
   `impacted_files` array tells you exactly which files matter for this
   change.
3. **Read ONLY the files listed in `impacted_files`** — do not grep the
   repo, do not read unrelated files.
4. Make the edit.
5. If you create new files, run `pv add-file <id> <path>` to keep the
   codemap in sync.

This is a hard requirement, not a suggestion. The graph is the source of
truth for what code needs to change.

Useful commands:
- `pv list --pretty` — see all nodes
- `pv show <id>` — see a specific node and its incoming relations
- `pv impact <id> --pretty` — get the file set for a change
