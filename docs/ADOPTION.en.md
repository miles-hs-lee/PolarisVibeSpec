# Adopting Polaris Vibe Spec in your repo

A practical guide for adding an *intent layer* to a real codebase: a hand-authored graph of requirements, APIs, workflows, and entities, paired with a code map. PV's headline use is a **PR-time drift gate** — when code changes, surface the changes that have diverged from the documented intent. The graph also doubles as a living architecture record (humans read `spec/`, CI catches drift) and as focused context for an AI coding agent.

> Korean version: [ADOPTION.ko.md](ADOPTION.ko.md). For internal design notes (asymmetric traversal, classifier, ID format, layout), see [ARCHITECTURE.md](ARCHITECTURE.md). For the value framing and where PV fits in the broader landscape, see [POSITIONING.md](POSITIONING.md).

## Will PV actually help your repo?

PV's value comes in this order — what shows up first in practice for a team that adopts it:

1. **Intent drift gate at PR time** (the headline): `pv changed` joins `git diff` against the codemap and PRDs. It catches new files added without a codemap link, removed/renamed files whose codemap entries are now broken, and Intent nodes whose linked PRD sections may need updates. Exits non-zero on warn/error so CI can gate the PR. Bundled GitHub Action ([`.github/workflows/pv-changed.yml`](../.github/workflows/pv-changed.yml)) runs this on every PR and posts a comment — zero LLM cost, ~1–3 seconds of Node execution.

2. **Semantic drift review** (`pv review --prompt`): for non-trivial behavior changes, PV emits a Markdown prompt covering the diff, linked Intent context (with PRD section dedup), and a JSON output spec. Pipe it to your existing coding agent (Claude Code, Codex, Cursor, …); the agent identifies stale Intent descriptions, missing nodes, PRD contradictions, and codemap link issues. PV doesn't call the LLM itself — your agent runs it with its own keys and tools, and you review proposed patches before applying.

3. **Architecture documentation** (the foundation): `pv export-all` writes `spec/<id>.md` per node plus per-domain narrative pages with embedded Mermaid diagrams. `pv validate` catches dangling relations / duplicate ids / orphan source files. `pv promote` lets reviewers edit prose in markdown and round-trip back to JSON. This is what *makes* the drift gate work — without an intent layer, there's nothing to drift from.

4. **Agent context** (optional): when running an agent for code changes, give it focused context via `pv impact <id>` (file set for a node change) or `pv why <path>` (reverse lookup). Bench-002 measured 17–28% cost / 44–47% tool savings on PV-positive task shapes (Sonnet, 37-file fixture, N=2). Bench-005 showed −53% tools / −15% cost on a task whose connection lived only in graph relations. Real but task-dependent — see [`experiments/README.md`](../experiments/README.md). The drift gate value, by contrast, is universal: it does not depend on what model or agent you use.

| You're shipping… | What PV gives you |
|---|---|
| Any PR with code changes | Structural drift gate via `pv changed` (universal) |
| Non-trivial behavior change | Add semantic review via `pv review --prompt` |
| Code change with an AI agent in the loop | Optional `pv impact` / `pv why` for focused context |
| Tiny repo (<10 source files) | Skip PV; the gate has nothing meaningful to check |

**Bottom line:** PV pays off for repos roughly ≥30 source files with clear domain boundaries. The dominant value is the PR-time drift gate; agent integration is a useful secondary benefit when applicable.

## Install

PV is a small TypeScript CLI; install from source:

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build
npm link        # exposes `pv` globally
```

Or run via absolute path: `node /path/to/PolarisVibeSpec/dist/cli.js …`.

## Step 1 — Sketch your graph (the once-only cost)

The fastest way to start is `pv bootstrap`:

```bash
pv bootstrap                 # scans src/ by default
pv bootstrap --root packages # or wherever your code lives
```

It writes `.polaris/graph.bootstrap.json` and `.polaris/codemap.bootstrap.json` (separate from your real graph — nothing is overwritten). Each proposed node carries a `confidence` and `reason`. On a typical 30–40 file domain split (auth/billing/orders/...) it covers ~80% of what you'd write by hand.

**Faster path with an agent**: pass `--prompt` to delegate the semantic refinement to your coding agent (Claude Code, Codex, ...). PV writes the heuristic draft, then prints a structured prompt covering schema, the draft, and a step-by-step task. The agent reads your actual files, refines descriptions, infers relations from imports, and writes the final `graph.json`.

```bash
pv bootstrap --prompt
# pipe into your agent, or paste the printed prompt
```

Then **curate** (or skip if you used `--prompt` and your agent finished the job):

1. Open `graph.bootstrap.json`. Fix titles, replace the auto-description with the actual *intent*.
2. Add **REQ nodes** — bootstrap deliberately doesn't propose requirements because they live in the user's head, not the file tree.
3. Add **relations**: `implements` from APIs to REQs, `uses` between modules that call each other.
4. Open `codemap.bootstrap.json`. Merge entries that should map to the same node (e.g., a repository file folded into the entity it serves).
5. When happy: `mv .polaris/graph.bootstrap.json .polaris/graph.json` (and codemap).
6. `pv validate` — the `orphan_source` warnings tell you exactly what's still uncovered.

If bootstrap doesn't fit your repo (no `src/`, unusual layout, or you want full manual control), skip ahead and write `.polaris/graph.json` by hand. Don't try to model everything — start with the 10–20 nodes that cover the change-prone surface area.

A minimal example (auth domain):

```json
{
  "version": 1,
  "nodes": {
    "REQ-AUTH-001": {
      "id": "REQ-AUTH-001",
      "type": "requirement",
      "domain": "AUTH",
      "title": "Users can sign in with email + password",
      "description": "...",
      "tags": ["auth", "login"],
      "relations": [],
      "createdAt": "2026-05-03T00:00:00.000Z"
    },
    "ENT-AUTH-USER": { "id": "ENT-AUTH-USER", "type": "entity", "domain": "AUTH", "title": "User record", "description": "id, email, password_hash, created_at", "tags": ["auth"], "relations": [], "createdAt": "..." },
    "API-AUTH-LOGIN": {
      "id": "API-AUTH-LOGIN", "type": "api", "domain": "AUTH",
      "title": "POST /auth/login", "description": "...", "tags": ["auth"],
      "relations": [
        { "type": "implements", "target": "REQ-AUTH-001" },
        { "type": "uses", "target": "ENT-AUTH-USER" }
      ],
      "createdAt": "..."
    }
  }
}
```

Relation semantics — these drive `pv impact`:

| Relation | Meaning | Direction PV traverses for impact-of(N) |
|---|---|---|
| `depends_on` | A depends on B | reverse — A is impacted when B changes |
| `implements` | A is the concrete impl of req B | reverse — implementers are impacted |
| `uses` | A calls/uses B | reverse — callers break when B changes |
| `affects` | A explicitly touches B | forward |

For ID format we recommend `<TYPE>-<DOMAIN>-<NAME>`:
- `REQ-<DOMAIN>-NNN` (numeric counter)
- `API-<DOMAIN>-<SLUG>` (e.g. `API-AUTH-LOGIN`)
- `WF-<DOMAIN>-<SLUG>`
- `ENT-<DOMAIN>-<NAME>`

You can also seed nodes with `pv generate "<intent>"` (heuristic compiler) and edit the JSON afterwards. **Or delegate to your agent**:

```bash
pv generate "Add passkey login" --prompt
# emits a prompt with schema + relevant existing nodes; agent edits graph.json
```

For nodes that exist but have empty / auto-generated descriptions:

```bash
pv enrich <node-id> --prompt
# emits a prompt naming the codemap files; agent reads them and writes intent-level prose
```

These three `--prompt` modes (`generate`, `bootstrap`, `enrich`) are how PV scales beyond what its heuristic compiler can do, without managing API keys or model selection inside PV — your agent is the LLM.

## Step 2 — Build the codemap

`.polaris/codemap.json` maps each node id to file paths. The `pv impact` output is only as good as this map.

```json
{
  "ENT-AUTH-USER": ["src/auth/user.ts", "src/auth/repository.ts"],
  "API-AUTH-LOGIN": ["src/auth/login.ts", "src/router.ts"]
}
```

You can also build it incrementally: every time you make a code change, run `pv add-file <node-id> <path>`.

Run `pv validate` to catch dangling relations, duplicate ids, and **orphan source files** (files in `src/` that aren't covered by any codemap entry — the leading indicator of a stale graph).

## Step 3 — Optional: AI agent integration

The drift gate (`pv changed`, `pv review --prompt`) and the rest of the documentation surface all work without an agent — humans run them in CI and at review time. This step wires an agent into the same loop so it can resolve drift findings (link orphan files, draft missing Intent nodes, fix codemap entries) and use `pv impact` / `pv why` for focused context on code changes.

You have two options. **Pick the skill** unless you have a specific reason not to.

### Option A (recommended): Claude Code skill

Skills load only when triggered, so they don't tax every turn. Copy the bundled skill directory into your repo:

```bash
mkdir -p .claude/skills
cp -r /path/to/PolarisVibeSpec/skills/pv .claude/skills/pv
```

The skill's `description` matches when the user requests a code change or graph maintenance action in a repo that has `.polaris/graph.json`. For code changes it instructs the agent to run `pv changed` before pushing and `pv review --prompt` for non-trivial behavior changes, then follow the prompt's findings. For graph maintenance (`pv generate --prompt`, `pv bootstrap --prompt`, `pv enrich --prompt`, `pv promote`) it routes the user's request to the right `--prompt` mode and instructs the agent to read existing files, edit `.polaris/graph.json`, and validate.

### Option B: minimal CLAUDE.md

If you don't use skills (or your agent doesn't support them), add a minimal CLAUDE.md to your repo root. **Keep it short** — bench-002 found that CLAUDE.md length itself dominates rename-task cost:

```markdown
# Project notes

This repo has a `.polaris/graph.json` describing its architecture, with a
`pv` CLI on PATH for querying it.

Before pushing a code change, run the drift gate:

    pv changed origin/main

For non-trivial behavior changes, also run:

    pv review origin/main --prompt > /tmp/review.md

Then read `/tmp/review.md` and follow its instructions. Apply proposed
patches via `pv generate`, `pv promote`, `pv add-file`, or `pv link`.

Optional helpers when you already know the node or file: `pv impact <id>`,
`pv why <path>`.
```

That's it. Don't add routing tables or detailed instructions — the data flatly says verbose CLAUDE.md costs more than it saves. The full repo's own [`CLAUDE.md`](../CLAUDE.md) is a working example of this shape.

## Step 4 — Daily workflow

```bash
# PR DRIFT GATE (the headline — run before every push, and in CI)
pv changed origin/main           # structural drift; exits 1 if anything needs attention
pv review origin/main --prompt   # semantic drift via your coding agent; emits a Markdown prompt

# AFTER EDITING .polaris/graph.json
pv export-all                    # regenerate spec/<id>.md per node + per-domain pages
pv validate                      # graph integrity (dangling relations, orphan sources, dup ids)

# CODE REVIEW (during PR review, onboarding, debugging)
pv why src/path/to/file.ts       # what node(s) does this file implement?
pv diff main                     # graph-level diff vs base ref (paste into PR description)
pv impact <node-id>              # focused file set for a node change
pv diagram --node <id> -f mermaid > arch.mmd

# ADDING / MOVING SOURCE FILES
pv add-file <node-id> <path>
pv rm-file <node-id> <path>

# PRD CROSS-CHECK (if your repo has docs/prd/*.md with pv-intents directives)
pv prd check                     # validates referenced ids exist; CI also runs this
pv prd check --prompt            # semantic review of PRD ↔ graph alignment via agent

# OPTIONAL HELPERS
pv ask "<your intent>" --minimal # one-shot: classify intent + impact on top hit
pv health                        # graph quality metrics (coverage, isolation, density)
pv stats                         # usage metrics over time
```

### A typical PR flow

```bash
# 1. Make code changes, then run the structural gate locally:
$ pv changed origin/main
{ "ok": false, "warnings": [{"kind":"orphan_added","path":"src/billing/refund.ts"}], ... }

# 2. Resolve the finding — link the new file:
$ pv add-file API-BILLING-REFUND src/billing/refund.ts

# 3. For non-trivial changes, get a semantic review from your agent:
$ pv review origin/main --prompt > /tmp/review.md
# Pipe /tmp/review.md to Claude Code / Codex / Cursor; the agent
# returns proposed patches (description updates, missing nodes,
# PRD contradictions). Review and apply with pv generate / pv promote
# / pv link as appropriate.

# 4. Push. CI re-runs `pv changed` and gates the merge if anything
#    drifted again.
```

### A PR-review flow (reviewer side, no local clone)

The bundled GitHub Action posts a Markdown comment summarizing `pv changed` findings on every PR. Reviewers read the comment to see at a glance whether the PR added orphan files, broke codemap entries, or touched Intent nodes whose PRD sections might need an update.

For deeper review locally:

```bash
# Understand a changed file
pv why src/billing/cancel.js
# → "implements API-BILLING-CANCEL"
#   "used by WF-BILLING-INVOICE"
#   "touches ENT-BILLING-SUBSCRIPTION"

# Graph-level diff of the PR
pv diff main
# → "Added: REQ-BILLING-007, API-BILLING-REFUND. Changed: ENT-BILLING-INVOICE (description)."
```

### Agent context for code changes (optional)

When working with an AI agent on a scoped or cross-domain task, give it focused context:

```bash
$ pv ask "Add last_login_at to User and update on login" --minimal --pretty
{
  "root": "ENT-AUTH-USER",
  "coverage": "broad",
  "files": ["src/auth/user.ts", "src/auth/login.ts", "src/auth/repository.ts"],
  "recommendation": "use_pv",
  "reason": "Looks like a scoped feature add — bench-002 showed PV saves -17% cost, -47% tools."
}
```

The agent reads only the listed files and edits within them. For renames or pattern substitutions where filenames already reveal the surface, `pv ask`'s classifier returns `use_grep` and the agent skips PV entirely.

## Editing the spec by hand

`spec/<id>.md` is auto-generated by `pv export-all`, but humans (and PR reviewers) often want to fix a typo or refine a description directly in markdown. `pv promote` makes that round-trip safe:

```bash
# you edit spec/REQ-AUTH-001.md by hand (typo, better description, new tag)
pv promote --dry-run    # preview what would be applied
pv promote              # apply prose changes (title / tags / description) to graph.json
```

`pv promote` only accepts **prose** edits. If you change anything structural in markdown — id, type, domain, createdAt, or outgoing relations — the file is rejected with the reason and you'll be told which tool to use instead (`pv link` for relations, `pv generate "<intent>" --prompt` to add a node, or a graph.json edit). This protects referential integrity while still letting you live-edit the parts that are pure prose.

Round-trip is idempotent: `pv export-all` → no edits → `pv promote` reports every node as `unchanged`.

The bundled skill recognizes "I edited spec markdown — sync those changes" requests and routes the agent to `pv promote` automatically.

## Known limitations

Be aware of these failure modes when deciding whether PV pays off for *your* repo:

- **Stale codemap → wrong files.** If you forget `pv add-file` after creating a file, `pv impact` / `pv ask` return a confidently incomplete file set. Mitigations are layered: `pv changed` at PR time flags new files added without a codemap link (the primary defense); `pv validate` flags `orphan_source` files in the working tree; `pv stats` shows your read-set ratio over time as an ambient drift signal.
- **Semantic drift is best-effort.** `pv changed` catches structural drift (orphan files, broken codemap entries, touched Intent nodes) deterministically. Catching when an Intent description has *quietly become wrong* — same files, but the behavior changed — requires `pv review --prompt` plus your agent's judgement. There's no automated detector that doesn't burn LLM tokens, and a lazy reviewer can still wave through a stale description.
- **Maintenance cost.** Every new source file: `pv add-file` (or accept the `pv changed` warning at PR time). Every graph edit: `pv export-all`. Budget ~30s per code-change PR. For teams that ship many small PRs this is a tax; the cumulative cost of *not* keeping the graph fresh is worse, but it's still a tax.
- **Agent-integration savings are task-dependent.** When you do wire an agent (Step 3), bench-002 / bench-005 measured 17–53% tool savings on PV-positive task shapes. Bench-004 found the effect disappears on filename-obvious tasks at scale. Treat agent integration as a useful secondary benefit, not the headline.

`experiments/bench-003/` measures the cost of stale state directly, including a "completely outdated graph" scenario.

## Step 5 — Maintenance & CI

Day-to-day:

- Whenever you add or move source files, run `pv add-file` / `pv rm-file` — or rely on `pv changed` at PR time to flag what's missed.
- After editing `.polaris/graph.json`, run `pv export-all` to regenerate `spec/`. Commit both — PR diffs then show graph changes in human-readable form.

Recommended CI:

1. **Drift gate on every PR** (the headline). Copy [`.github/workflows/pv-changed.yml`](../.github/workflows/pv-changed.yml) into your repo. It runs `pv changed` against the PR base, posts a Markdown summary as a PR comment (updating in place across pushes), and fails the check on warn/error findings. Zero LLM cost; ~1–3 seconds per PR.

2. **Graph integrity & spec freshness**. In your existing test workflow, add:

   ```bash
   pv validate                              # dangling relations, dup ids, orphan sources
   pv export-all && git diff --quiet spec/  # spec is regenerated and committed
   ```

3. **PRD cross-check** (only if you use `docs/prd/*.md` with `pv-intents` directives):

   ```bash
   pv prd check
   ```

   Catches dangling Intent references in your PRDs.

4. **Per-domain diagram drift** (optional): `pv diagram` is deterministic given the graph, so the [`pr-graph-diff.yml`](../.github/workflows/pr-graph-diff.yml) workflow surfaces graph-level changes in the PR description. Useful on teams where reviewers don't run `pv` locally.

The pivot from "agent token-savings tool" to "drift gate" was empirically validated in [`experiments/audit-after-pivot/`](../experiments/audit-after-pivot/) — running PV against itself caught one real drift after a multi-commit reframing pass. The same gate is what runs in this repo's own CI.

## What to skip

- Don't model trivial files in the graph (helpers, constants). Model what's change-prone or cross-cutting.
- Don't auto-generate the graph from code structure — the value is the *intent* layer, not a re-render of the file tree.
- Don't write long CLAUDE.md files. The data is unambiguous: short wins.

## Reference

- Empirical data: [`experiments/README.md`](../experiments/README.md)
- Auto-generated spec for PV itself: [`spec/`](../spec/)
- Source graph: [`.polaris/graph.json`](../.polaris/graph.json)
