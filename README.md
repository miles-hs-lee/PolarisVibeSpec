# Polaris Vibe Spec

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![CI](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml/badge.svg)](https://github.com/miles-hs-lee/PolarisVibeSpec/actions/workflows/ci.yml)

> Spec-driven coding layer between a GitHub repo and an AI coding agent (Codex, Claude Code, ...).
> **Graph = memory · Markdown = view · CLI = control surface · AI = compiler · Codex = executor.**

## 30-second start

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build

# scaffold a starter graph from your own repo's source tree
cd /path/to/your-repo
node /path/to/PolarisVibeSpec/dist/cli.js bootstrap --prompt
# review .polaris/graph.bootstrap.json, then mv it to graph.json

# ask before any code change
pv ask "Add lastLoginAt to User and update on login" --minimal
# → returns {recommendation, files} so your agent reads only what matters
```

For a full walkthrough see **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)** ([한국어](docs/ADOPTION.ko.md)).

## Why

When Codex modifies code, it scans the repo blindly — burning tokens and making
over-broad changes. Polaris Vibe Spec gives Codex a tight answer to the
question "what does this change touch?" via a stable graph of spec nodes
(requirements, APIs, workflows, entities) plus a spec → file map. Codex queries
the graph, gets `{impacted_nodes, impacted_files}`, and edits only what matters.

- **Reduce context usage** — Codex pulls a focused file list instead of grepping the repo.
- **Increase modification accuracy** — typed relations make scope explicit.
- **Enable impact-based coding** — every change starts from `pv impact <id>`.

## Architecture (one diagram, in words)

```
Intent (natural language)
        │
        ▼
  intentToGraph (heuristic compiler, --llm flag stubbed)
        │
        ▼
  Graph (.polaris/graph.json, source of truth)
        │
        ├─ ops (search, link)        ─► pv query / pv link / pv list / pv show
        ├─ traverse (asymmetric BFS) ─► pv impact ──┐
        └─ graphToMarkdown           ─► pv export   │
                                                    ▼
                              CodeMap (.polaris/codemap.json)
                                                    │
                                                    ▼
                              { impacted_nodes, impacted_files,
                                inferred_files, warnings }
```

## Install

```bash
npm install
npm run build
npm link        # exposes `pv` globally; or use `node dist/cli.js`
```

## Adopting in your own repo

See **[docs/ADOPTION.en.md](docs/ADOPTION.en.md)** ([한국어](docs/ADOPTION.ko.md))
for a step-by-step guide on bootstrapping a graph + codemap, wiring to
your AI coding agent, and the empirically-derived rules of thumb.

The recommended way to wire Claude Code to your PV-aware repo is the
bundled skill at [`skills/pv/SKILL.md`](skills/pv/SKILL.md) — copy it to
`.claude/skills/pv.md` in your project. Skills load only when triggered,
so they avoid the always-on system-prompt cost that bench-002 found
dominates rename-task overhead.

## Quick start (seed demo)

```bash
mkdir -p .polaris
cp examples/seed-graph.json .polaris/graph.json
cp examples/seed-codemap.json .polaris/codemap.json

pv list --pretty
pv query "login" --pretty
pv impact ENT-AUTH-USER --pretty
pv export REQ-AUTH-001
```

`pv impact ENT-AUTH-USER` returns the entity plus the API and workflow that
use/affect it, plus three explicit files (`src/auth/login.ts`,
`src/auth/login.test.ts`, `src/auth/user.ts`, `db/migrations/001_users.sql`) —
exactly the surface Codex needs to change a column without scanning the repo.

## Codex usage flow

User: *"Change login to passkey."*

```bash
pv query "login"                              # → REQ-AUTH-001, API-AUTH-LOGIN, WF-AUTH-LOGIN
pv impact REQ-AUTH-001                        # → impacted_nodes + impacted_files
# Codex edits ONLY the listed files, updates tests.
pv generate "Add passkey support to login"    # mints a new requirement, auto-affects AUTH peers
pv link API-AUTH-LOGIN <NEW-ID> implements    # attach the implementation edge
pv add-file <NEW-ID> src/auth/passkey.ts      # close the loop on new files
pv export <NEW-ID> --write                    # regenerate the markdown view
```

## CLI reference

| Command | Notes |
|---|---|
| `pv ask "<intent>"` | one-shot agent preamble: classify intent + search + impact for top hit |
| `pv generate "<intent>"` | heuristic compile → new node(s); `--llm` stubbed |
| `pv query "<text>"` | ranked: tag=3, title=2, description=1; `-n <limit>` |
| `pv show <id>` | node + incoming relations |
| `pv link <fromId> <toId> <relation>` | relation ∈ `depends_on`/`implements`/`affects`/`uses` |
| `pv impact <id> [-d N]` | asymmetric BFS, default depth 3, returns `coverage: narrow\|broad\|global` |
| `pv export <id> [--write]` | Markdown to stdout (default) or `.polaris/specs/<id>.md` |
| `pv list [-t TYPE] [-d DOMAIN]` | discovery before query |
| `pv add-file <id> <path>` | extend codemap |
| `pv rm-file <id> <path>` | shrink codemap |
| `pv validate` | dangling relations, dup ids, missing files |

All commands print **JSON to stdout by default** (Codex-friendly). Add `--pretty`
for human reading. `pv export` without `--write` prints raw Markdown so it can
be piped.

## Asymmetric impact traversal

Symmetric BFS returns half the codebase and burns the token savings. Edge
direction is interpreted relative to "what changes when I change N":

| Relation | Direction traversed |
|---|---|
| `depends_on` | reverse — anyone who depends on N is impacted |
| `implements` | reverse — implementers of N are impacted |
| `uses` | reverse — callers of N are impacted (if A uses N, changing N breaks A) |
| `affects` | forward — N already declares what it affects |

Default depth: **3**. Cycles are de-duplicated. Missing relation targets become
non-fatal warnings.

## Code map: explicit vs inferred

`.polaris/codemap.json` is the trusted source. If a node has no explicit entry,
the resolver falls back to `src/<domain-lowercased>/**` based on tags/domain.
The two are returned in **separate fields** (`impacted_files` vs
`inferred_files`) so Codex never treats a glob guess as ground truth.

## Heuristic compiler (intent → graph)

Pure-function and offline. `--llm` is wired but stubbed — the seam is visible
for a future hookup.

- **Domains:** AUTH (auth/login/passkey/jwt/...), BILLING (pay/invoice/stripe/...),
  ORDER (order/cart/checkout/...), NOTIF (email/sms/push/...), USER (user/profile/...),
  fallback `GENERAL`.
- **Type:** HTTP-verb prefix → `api`; flow/process/step/when…then → `workflow`;
  table/model/entity/schema → `entity`; default → `requirement`.
- **Auto-relations:** explicit id mention with `implements REQ-…` → `implements`;
  with `uses/calls/invokes` → `uses`; otherwise → `affects`. Same domain (cap 3)
  → `affects`. Never auto-mints `depends_on`.

## ID format

Stable, deterministic, never reassigned.

- `REQ-<DOMAIN>-<NNN>` — e.g. `REQ-AUTH-001`
- `API-<DOMAIN>-<SLUG>` — e.g. `API-AUTH-LOGIN`
- `WF-<DOMAIN>-<SLUG>` — e.g. `WF-AUTH-LOGIN`
- `ENT-<DOMAIN>-<NAME>` — e.g. `ENT-AUTH-USER`

Counters in `.polaris/counters.json`; collisions disambiguated deterministically.

## Layout

```
src/
  cli.ts                       commander entrypoint
  types.ts                     SpecNode, Relation, Graph, CodeMap, ImpactResult
  ids.ts                       ID minting + counter persistence
  output.ts                    JSON / fail helpers
  util/{atomic,paths}.ts
  graph/{store,ops,traverse}.ts
  compiler/{intentToGraph,graphToMarkdown}.ts
  context/codeMap.ts
  impact/analyze.ts
  commands/{generate,query,show,link,impact,export,list,addFile,rmFile,validate}.ts
.polaris/
  graph.json                   source of truth
  codemap.json                 nodeId → string[] of paths
  counters.json                ID counter state
  specs/                       generated markdown views (do not hand-edit)
examples/
  seed-graph.json
  seed-codemap.json
```

## Empirical results — when PV actually saves tokens

We measured PV against blind exploration on a 37-file fixture across three
task types using Claude Code in headless mode. **The verdict is task-shape
dependent, not a uniform win:**

| Task | Tools (Δ) | Cost (Δ) | Wall (Δ) |
|---|---|---|---|
| Add a field to an entity (scoped, deep) | **−47%** | −17% | −27% |
| Cross-domain refactor (Order → Billing) | **−44%** | −28% | −28% |
| Pure rename (`passwordHash` → `password_hash`) | **+44%** | +65% | +63% |

PV wins when the agent would otherwise read defensively across many files.
PV **loses** when grep's pattern match already gives a deterministic answer
(rename refactors). The default "always use pv first" policy is the wrong
default — see [CLAUDE.md](CLAUDE.md) for the nuanced guidance and
[experiments/README.md](experiments/README.md) for the full data.

## Self-hosted

This repo dogfoods its own product: [.polaris/graph.json](.polaris/graph.json)
describes the PolarisVibeSpec codebase itself (28 nodes covering the type
contracts, persistence, traversal, compiler, every CLI command, and 6
improvement requirements derived from the experiments above), with
[.polaris/codemap.json](.polaris/codemap.json) mapping each node to its
source files. The human-readable view lives in [`spec/`](spec/) and is
regenerated by `pv export-all`.

```bash
node dist/cli.js impact WF-PV-IMPACT --pretty
# → 5 files: cli.ts, commands/impact.ts, graph/ops.ts, graph/traverse.ts, impact/analyze.ts

node dist/cli.js export-all
# → spec/<id>.md per node + spec/README.md index
```

## Out of scope

No editor, no GUI, no real LLM call (heuristic only), no DB, no cloud, no daemon,
no git integration, no markdown-as-source.
