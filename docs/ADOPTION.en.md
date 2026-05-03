# Adopting Polaris Vibe Spec in your repo

A practical guide for adding an *intent layer* to a real codebase: a hand-authored graph of requirements, APIs, workflows, and entities, paired with a code map. The graph is your living architecture record (humans read `spec/`, CI catches drift); it also doubles as routing context for an AI coding agent (Claude Code, Codex, Cursor, custom agents).

> Korean version: [ADOPTION.ko.md](ADOPTION.ko.md). For internal design notes (asymmetric traversal, classifier, ID format, layout), see [ARCHITECTURE.md](ARCHITECTURE.md). For the value framing and where PV fits in the broader landscape, see [POSITIONING.md](POSITIONING.md).

## Will PV actually help your repo?

PV provides three distinct kinds of value. The honest order — what most users will benefit from first:

1. **Documentation** (universal): `pv export-all` writes a `spec/<id>.md` per node + an index. PR diffs show graph changes readably. `pv validate` catches drift (orphan source files, dangling relations). `pv promote` lets reviewers edit prose in markdown and round-trip back to JSON. **This value applies regardless of whether you use an AI agent or which one** — the graph is the architectural record, and PV maintains it.

2. **Framing** (when applicable): a `.polaris/graph.json` plus a minimal CLAUDE.md noting the repo has structured architecture metadata makes the agent less defensive. Bench-002 measured 17–28% cost / 44–47% tool savings on PV-positive task shapes (Sonnet, 37-file fixture, N=2). The savings show up whether or not the agent invokes `pv ask`. Caveat: bench-004 found the effect is task-dependent — on filename-obvious tasks at scale, the agent is already efficient and PV adds nothing.

3. **Routing tools** (cross-domain hidden links): `pv ask` classifies the intent; `pv impact` returns a focused file set. Bench-005 measured −53% tools / −15% cost on a task whose connection lived only in graph relations (cancellation → analytics + notification). When filenames do reveal the right set, coerced PV invocations are overhead — `pv ask`'s classifier routes those cases to grep automatically.

Empirical task-shape table from bench-002:

| You're changing… | bench-002 result |
|---|---|
| A scoped feature inside one domain (add a field, a new endpoint) | **−47% tools, −17% cost** |
| Something that crosses domains (Order touches Billing) | **−44% tools, −28% cost** |
| A pure rename (`fooBar` → `foo_bar`) where grep is deterministic | classifier routes to grep; matches baseline |
| Anything in a tiny repo (<10 source files) | PV overhead exceeds savings |

**Bottom line:** PV pays off for repos roughly ≥30 source files with clear domain boundaries — but the dominant mechanism at that scale is *framing*, not the routing tools. Both are real value; just be clear about which.

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

If you do use an AI coding agent (Claude Code, Codex, Cursor, ...) and want the framing/routing benefits described above, wire it to PV. Skip this step entirely if you only want PV's documentation value — the graph, `spec/`, validate, diagram, and PR-diff all work without an agent in the loop.

You have two options. **Pick the skill** unless you have a specific reason not to.

### Option A (recommended): Claude Code skill

Skills load only when triggered, so they don't tax every turn. Copy the bundled skill directory into your repo:

```bash
mkdir -p .claude/skills
cp -r /path/to/PolarisVibeSpec/skills/pv .claude/skills/pv
```

The skill's `description` matches when the user requests code changes in a repo that has `.polaris/graph.json`, and instructs the agent to run `pv ask "<intent>"` first and follow the `classification.recommendation` it returns.

### Option B: minimal CLAUDE.md

If you don't use skills (or your agent doesn't support them), add a minimal CLAUDE.md to your repo root. **Keep it short** — bench-002 found that CLAUDE.md length itself dominates rename-task cost:

```markdown
# Project notes

This repo has a `.polaris/graph.json` describing its architecture. Before
any code change, run `pv ask "<your intent>"` and follow the
`classification.recommendation` field (`use_pv` / `use_grep` / `use_both`).
```

That's it. Don't add routing tables or detailed instructions — the data flatly says verbose CLAUDE.md costs more than it saves.

## Step 4 — Daily workflow

The documentation commands apply to every team. The agent commands apply only if you completed Step 3.

```bash
# DOCUMENTATION (universal — these are the daily commands)
pv export-all                # regenerate spec/<id>.md per node + spec/README.md
pv validate                  # graph integrity (dangling relations, orphan sources, dup ids)
pv health                    # graph quality metrics (coverage, isolation, density)

# CODE REVIEW (during PR review, onboarding, debugging)
pv why src/path/to/file.ts   # what node(s) does this file implement?
pv diff main                 # graph-level diff vs base ref (paste into PR description)
pv diagram --node <id> -f mermaid > arch.mmd

# ADDING / MOVING SOURCE FILES
pv add-file <node-id> <path>
pv rm-file <node-id> <path>

# OPTIONAL — only if you wired an AI agent in Step 3
pv ask "<your intent>" --minimal
# → classification.recommendation: use_pv | use_grep | use_both
```

A typical flow on a feature task that uses an agent:

```bash
$ pv ask "Add last_login_at to User and update on login" --minimal --pretty
{
  "recommendation": "use_pv",
  "reason": "Looks like a scoped feature add — bench-002 showed PV saves -17% cost, -47% tools.",
  "root": "ENT-AUTH-USER",
  "coverage": "broad",
  "files": ["src/auth/user.ts", "src/auth/login.ts", "src/auth/repository.ts"]
}
```

The agent reads only the three listed files and edits within them.

A typical flow on a rename task (PV's classifier routes to grep):

```bash
$ pv ask "Rename passwordHash to password_hash" --minimal --pretty
{
  "recommendation": "use_grep",
  "reason": "Looks like a rename or pattern substitution — PV adds 44–65% overhead vs grep.",
  ...
  "files": []
}
```

The agent skips PV entirely and runs `grep -rn passwordHash`.

A typical PR-review flow without any agent:

```bash
# Reviewer wants to understand a changed file
pv why src/billing/cancel.js
# → "implements API-BILLING-CANCEL"
#   "used by WF-BILLING-INVOICE"
#   "touches ENT-BILLING-SUBSCRIPTION"

# Reviewer wants to see the graph-level impact of the PR
pv diff main
# → "Added: REQ-BILLING-007, API-BILLING-REFUND. Changed: ENT-BILLING-INVOICE (description). No breaking changes."
```

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

- **Stale codemap → wrong files.** If you forget `pv add-file` after creating a file, `pv ask` returns a confidently incomplete file set. The agent then edits the listed files and misses the new one. Mitigations: `pv validate` flags `orphan_source` files; CI runs validate on every PR; `pv stats` shows your read-set ratio over time (a sudden jump is a drift signal).
- **Stale relations → confidence inflation.** A `coverage: narrow` recommendation says "trust this set." If the graph is *narrowly wrong* (a relation that should exist but doesn't), the agent produces a partial fix that may pass tests yet leave bugs. There's no automated detector for this today; periodic graph review is the only mitigation.
- **Maintenance cost.** Every new source file: `pv add-file`. Every graph edit: `pv export-all`. Budget ~30s per code-change PR. For teams that ship many small PRs this can erode the per-task savings; the cumulative cost of *not* keeping the graph fresh is worse, but it's a tax.
- **Per-turn invisibility.** A single PV-routed task saves ~17–28% on cost/wall when it fits. Users don't *feel* that on any individual task — only the aggregate (50–100 tasks) reads as a clear win. `pv stats` is how you see the aggregate.

`experiments/bench-003/` measures the cost of stale state directly, including a "completely outdated graph" scenario.

## Step 5 — Maintenance

- Whenever you add or move source files, run `pv add-file` / `pv rm-file` (or just `pv validate` periodically — orphan warnings tell you what to fix).
- After editing `.polaris/graph.json`, run `pv export-all` to regenerate `spec/`. Commit both — PR diffs then show graph changes in human-readable form.
- Add a CI check: `pv validate && pv export-all && git diff --quiet spec/`. Fails the build on stale spec or graph drift.

## What to skip

- Don't model trivial files in the graph (helpers, constants). Model what's change-prone or cross-cutting.
- Don't auto-generate the graph from code structure — the value is the *intent* layer, not a re-render of the file tree.
- Don't write long CLAUDE.md files. The data is unambiguous: short wins.

## Reference

- Empirical data: [`experiments/README.md`](../experiments/README.md)
- Auto-generated spec for PV itself: [`spec/`](../spec/)
- Source graph: [`.polaris/graph.json`](../.polaris/graph.json)
