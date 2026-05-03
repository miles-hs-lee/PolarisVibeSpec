# Positioning

This document records how Polaris Vibe Spec's framing changed across
five benches, what we learned, and where the project sits in the
broader landscape. It exists so future contributors don't have to
re-derive the reasoning behind the README.

## What we originally claimed

Early framing (commits up to `321337d`):

> A spec-driven coding layer between a GitHub repo and an AI coding
> agent. Reduces context usage. Increases modification accuracy.
> Enables impact-based coding.

The headline number was "agent reads only the impacted file set
instead of grepping the whole repo." Token cost savings of 17–28% on
the right task shapes (bench-002).

## What five benches actually showed

| bench | fixture | finding |
|---|---|---|
| 001 | 7 files | PV is overhead; too small for any value to pay off. |
| 002 | 37 files | 17–47% cost/tool savings on scoped + cross-domain feature tasks. Rename refactors lose without a classifier. |
| 003 | 37 files (drift scenarios) | Agent **never invoked `pv ask`**. The bench-002 savings came from *framing* (minimal CLAUDE.md noting structured architecture metadata) — not from agent consulting PV's output. Drift was therefore harmless. |
| 004 | 86 files (scale + coercion) | Scaling alone didn't surface the routing value. Coerced PV invocations were overhead on a filename-obvious task. |
| 005 | 86 files (cross-domain hidden link) | **Routing value confirmed**: −53% tools / −21% wall / −15% cost when the graph encodes a connection filenames don't reveal. First organic `pv ask` invocation observed. |

The bench-003 reframing was uncomfortable: most of the bench-002 wins
came from a structured-architecture *signal*, not from the routing
*tool* we'd been marketing. The bench-005 follow-up rescued the
routing value, but only for a specific task shape (cross-domain
connection living only in the graph).

## The honest three-axis value framework

| Value | Mechanism | When it applies | Evidence |
|---|---|---|---|
| **Documentation** | `pv export-all`, `pv validate`, `pv promote`, the graph as a single source of truth | Always — independent of agent behavior | All benches; structural |
| **Framing** | Graph + minimal CLAUDE.md → agent reads less defensively | Tasks with non-obvious blast radius; doesn't apply to filename-obvious tasks at scale | bench-002 |
| **Routing** | `pv ask` / `pv impact` as direct file-set selector | Cross-domain connections encoded in graph but not in filenames | bench-005 |

Documentation applies to every repo with a graph. Framing helps on
some task shapes. Routing is a real but bounded subset (~tasks where
the right files are not obvious from names).

## The reframing decision

Earlier framing led with token efficiency. After bench-005 we kept
the numbers but reordered which value leads:

```
before: "Spec-driven coding layer between repo and agent. -47% tools."
after : "An intent layer for your codebase that humans and agents can read.
         Documentation always. Token savings on specific task shapes."
```

Why this is more honest:

1. The directly-routed savings are real but conditional. Selling them
   as the primary value misleads users whose tasks don't fit.
2. The documentation value is universal and structurally robust. It
   applies to teams that don't use AI agents at all, and it doesn't
   degrade as agents change.
3. PV's distinguishing feature isn't "agent gets fewer files" —
   plenty of tools narrow file sets. PV's feature is *the graph
   itself*: a structured intent layer that one schema serves to
   both humans and agents.

What we did NOT change:

- The empirical numbers stay where they are. We still report
  bench-002's 17-47% savings, bench-005's −53% tools, etc.
- The CLI surface is unchanged. `pv ask` / `pv impact` /
  `pv generate` etc. still exist; they just aren't the headline.
- The skill, the `--prompt` mode, the classifier — all stay.

The change is which number leads the README, and which value the
ADOPTION guide tells you to expect first.

## Where PV sits in the landscape

Several adjacent niches; none of them is exactly PV's combination.

### Architecture documentation (closest spirit)

- **[Structurizr](https://structurizr.com/) / [C4 model](https://c4model.com/)**
  — Simon Brown's architecture-as-code tooling. The closest mental
  cousin to PV. Both encode architectural intent in a structured
  text artifact; both produce a graph of nodes + relations. The
  divergence is in *consumer*:
  - Structurizr DSL → System Context / Container / Component /
    Code views, optimized for humans browsing diagrams. Rich layout,
    multiple views per workspace, Cloud rendering.
  - PV `.polaris/graph.json` → flat node list + typed relations,
    optimized for queries by both humans (`pv export-all`,
    `pv diagram`) and an AI coding agent (`pv ask`, `pv impact`,
    `pv why`).

  Conceptual mapping (lossy in both directions):

  | Structurizr | PV |
  |---|---|
  | `softwareSystem` | (no equivalent — PV assumes single system) |
  | `container` | `entity` (broad) or `workflow` |
  | `component` | `entity` or `api` |
  | `relationship` | `relations` (uses, depends_on) |
  | `views` (auto-rendered) | `pv diagram` (called per-view) |

  An interop layer (`pv import-structurizr` / `pv export-structurizr`)
  is plausible future work but not built. The hierarchy mismatch
  (Structurizr's System > Container > Component vs PV's flat node
  list) makes round-trip inherently lossy. The honest framing: PV
  and Structurizr are different optimal points in the same design
  space, not strict alternatives — a team using both could let
  Structurizr handle the diagram-heavy stakeholder communication
  while PV drives the agent-aware spec.

- **[arc42](https://arc42.org/)** — markdown architecture template.
  Static, no graph, no tooling.
- **Architectural Decision Records (ADRs)** — markdown decision logs
  in `docs/adr/`. PV operates one level above: ADRs record *decisions*,
  PV records the *architecture* those decisions shape. They compose
  cleanly — an ADR can reference a PV node id (`Decision: extract
  ENT-AUTH-USER from BILLING domain`).

### Spec-first / contract-first

- **OpenAPI / GraphQL / Protobuf** — spec drives generated code, but
  for *interfaces* (HTTP, gRPC) only. PV operates at the architectural
  level above interfaces.
- **TypeSpec (Microsoft)** — multi-format API spec.
- **[Domain-Driven Design tooling]** (e.g., Context Map editors) —
  bounded contexts + relationships. Closer to PV's intent layer but
  usually stopping at diagrams.

### Code-level dependency graphs

- **Bazel / Buck / Pants BUILD files** — explicit build-target
  dependency graph. File/target level, mechanical, not intent-level.
- **CODEOWNERS** — file → team mapping. One axis (ownership), not a
  full graph.

### AI-agent steering

- **`.cursorrules` / Cline rules / `CLAUDE.md`** — text-based steering
  for an agent. No graph; no validation; no code mapping.
- **Skills (Claude Code) / MCP servers** — tool/skill packaging for
  agents. Orthogonal to PV (and PV ships a skill).

### Knowledge graphs / code search

- **Sourcegraph / GitHub Code Search / tree-sitter / LSP** — search
  and navigation over *existing code*. No intent layer; the graph is
  derived from code, not authored above it.

### The empty quadrant PV aims at

| | Human-authored intent | Code-derived (mechanical) |
|---|---|---|
| **Diagram / docs output** | Structurizr / C4 / arc42 / ADRs | (autogenerated dep graphs) |
| **Agent-aware CLI + validation** | **Polaris Vibe Spec** | Sourcegraph, LSP-driven tools |

Most of the existing tools are either docs-for-humans (left column)
or mechanical-extraction (right column). The "intent authored by a
person, queryable by both a person and an agent, validated against
real code" combination is what PV occupies.

## How project knowledge is organized

A natural follow-up question, especially for reimplementers: "is the
graph the only source of truth?" The honest answer is **no — PV
deliberately splits knowledge across four layers**, each with its own
canonical artifact, derived artifacts, and consistency mechanism.

```
┌──────────────────────────────────────────────────────────────┐
│ INTENT — "what should exist"                                 │
│   .polaris/graph.json     ◄─ canonical (the spec)            │
│   .polaris/codemap.json   ◄─ canonical (intent ↔ code map)   │
│   spec/<id>.md            ◄─ derived view (regen via export-all)
└──────────────────────────────────────────────────────────────┘
        ▲                                  │
        │ pv promote (prose only)          │ pv validate
        │                                  │ pv health
        │                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ BEHAVIOR — "how it actually works"                           │
│   src/**/*.ts             ◄─ canonical (runtime truth)       │
│   dist/cli.js             ◄─ derived (build output)          │
│   ⚠ no automated test suite — verified behavior is a gap     │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ justified by
        │
┌──────────────────────────────────────────────────────────────┐
│ RATIONALE — "why these choices"                              │
│   experiments/            ◄─ empirical evidence (5 benches)  │
│   docs/POSITIONING.md     ◄─ value framework, this file      │
│   docs/ARCHITECTURE.md    ◄─ design choices, algorithms      │
│   CHANGELOG.md            ◄─ temporal record                 │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ guides
        │
┌──────────────────────────────────────────────────────────────┐
│ USAGE — "how to use it"                                      │
│   README.md               ◄─ entry point                     │
│   docs/ADOPTION.{en,ko}   ◄─ user walkthrough                │
│   CONTRIBUTING.md         ◄─ contributor workflow            │
│   skills/pv/SKILL.md      ◄─ agent integration               │
└──────────────────────────────────────────────────────────────┘
```

### Each layer in detail

**1. Intent — what the project says it should be.**
The canonical artifact is `.polaris/graph.json`, paired with
`.polaris/codemap.json` that maps each node to the source files
implementing it. `spec/<id>.md` is a *derived view* — it's regenerated
from the graph by `pv export-all` and never read back as source (the
one exception, `pv promote`, applies *prose-only* edits to title /
tags / description; structural changes are rejected). This layer
answers "what nodes exist and how do they relate?" but does not
specify algorithms, output formats, or edge cases.

**2. Behavior — how the code actually runs.**
The canonical artifact is `src/**/*.ts`. `dist/cli.js` is a build
artifact. There is currently no automated test suite — this is an
honest gap: verified behavior would belong here, and reimplementers
have no test coverage to align against. The graph and the code are
kept loosely consistent by `pv validate` (orphan files, dangling
relations) and `pv health` (codemap coverage), but neither catches
all forms of drift (e.g., a relation that *should* exist but doesn't).

**3. Rationale — why each design choice was made.**
The five benches under `experiments/` are the empirical foundation:
they record what was measured, on what fixture, with what conditions,
producing what numbers. `docs/POSITIONING.md` (this file) records
the value framework that emerged. `docs/ARCHITECTURE.md` records
algorithm-level design (asymmetric BFS direction, classifier rules,
ID format). `CHANGELOG.md` records when each decision landed and
why. **A reimplementer starting from scratch would need this layer
more than any other** — the graph alone tells you what to build, but
the experiments and POSITIONING tell you why those choices, not
others.

**4. Usage — how a user actually adopts and operates the tool.**
`README.md` is the entry point. `docs/ADOPTION.{en,ko}.md` walks new
users through a real adoption. `CONTRIBUTING.md` describes the PR
workflow including the dogfooded `pv why` / `pv diff` / `pv health`
steps. `skills/pv/SKILL.md` is the bundled Claude Code skill. This
layer is hand-maintained, so it can drift from layers 1–3 — for
instance, if a CLI command is renamed in the code, the README has
to be hand-edited.

### Consistency mechanisms

| Constraint | Enforced by |
|---|---|
| `graph.json` references valid node ids | `pv validate` (dangling relation targets) |
| `codemap.json` files exist on disk | `pv validate` (missing files) |
| Source files all referenced by some codemap entry | `pv validate` (orphan source files) |
| `spec/<id>.md` matches graph state | `pv export-all` + `npm run spec:check` (CI) |
| Embedded diagrams in ARCHITECTURE.md match graph | `scripts/regen-diagrams.py` + `npm run diagrams:check` (CI) |
| Graph quality (coverage, isolation) | `pv health` (informational, CI step) |
| PR introduces graph changes visible to reviewers | `.github/workflows/pr-graph-diff.yml` posts `pv diff` as PR comment |

What's **not** enforced (intentional gaps):

- **Behavior matches intent.** No tests assert that `pv impact` actually
  returns what `WF-PV-IMPACT`'s description claims. A reimplementer
  could match the graph without producing equivalent runtime behavior.
- **Rationale stays valid.** REQ-PV-005's existence is justified by
  bench-002 task-3, but if that bench were rerun and the result changed,
  no automated check would surface that the rationale is now stale.
- **Usage docs match CLI.** README and ADOPTION reference command flags
  in prose; if a flag is renamed, only manual review catches it.

### Why this layering

A common alternative is "everything in one place" — make the graph the
sole source of truth, encode algorithms as pseudocode in node
descriptions, embed test cases as fields, link rationale by reference.
PV deliberately doesn't do that:

1. **Different audiences read different layers.** A user adopting PV
   reads README + ADOPTION, not graph.json. A reimplementer reads
   experiments + ARCHITECTURE, not just spec. A reviewer of a PR reads
   `pv diff`, not the whole graph.
2. **Drift is bounded per-layer.** When code changes, only validate +
   health are needed to catch graph drift — not 50 fields of
   description prose.
3. **Each artifact stays small enough to be useful.** A graph.json
   that contains algorithms, examples, decision rationales, and usage
   snippets is no longer a graph — it's a 5MB document that no tool
   can usefully query.

The cost is that no single file is "the project." A reader has to
follow links across layers to get the full picture. The benefit is
that each artifact does one thing well: the graph queries cleanly,
the code runs cleanly, the experiments reproduce cleanly, the docs
read cleanly.

### What this means for reimplementers

If you wanted to rebuild PV from scratch, you'd need:

- **`.polaris/graph.json` + `codemap.json`** to know *what* commands
  and types to implement, and how they're wired.
- **`docs/ARCHITECTURE.md`** to know *how* the asymmetric traversal,
  classifier, and ID format work — the algorithms.
- **`experiments/`** to know *why* the design landed where it did and
  what failure modes to avoid.
- **`spec/`** as a more digestible browseable form of the graph.
- **`README.md` + `docs/ADOPTION.*`** for the user-facing semantics
  (what each command should feel like to use).

The graph alone gets you ~30% of the way. The four layers together
are the spec.

## Open questions

1. **How well does the graph hold up at 1k+ files?** Bench-005 used 86.
   The validation pipeline scales linearly (it's just JSON), but
   maintenance cost might grow nonlinearly.
2. **How brittle is hand authoring at team scale?** Multiple authors,
   conflicting edits, drift between perceived architecture and actual.
   bench-003-style adversarial drift on a real team's repo would tell
   us.
3. **Does the agent's behavior shift with newer / larger / smaller
   models?** All measurements were on Sonnet. Opus 4.7 might be more
   willing to invoke `pv ask`; Haiku might require coercion in cases
   Sonnet doesn't.
4. **Could `pv` interop with Structurizr DSL or C4 / ADRs?** A sensible
   path to broader adoption is to NOT replace the existing architecture-
   docs world but plug into it.

## Practical implications for users

Read this if you're deciding whether to adopt PV:

- **You will benefit from the documentation value** if you have any
  repo with a non-trivial architecture and any team that does code
  review. This is the floor — adopt PV for this alone, and everything
  else is bonus.
- **You will benefit from the framing value** on tasks where the agent
  would otherwise read defensively. This is most agentic feature-add
  work on repos in the 30–100 file range.
- **You will benefit from the routing value** on cross-domain tasks
  where filenames don't reveal the connection. If your domain
  boundaries are tidy (each domain in its own folder, clear naming),
  this value applies less often than you might hope.

If the documentation value alone isn't worth it for you, the agent
benefits probably aren't either — they layer on top.

## References

- All five benches: [`experiments/README.md`](../experiments/README.md)
- The reframe-triggering result: [`experiments/bench-003/README.md`](../experiments/bench-003/README.md)
- The routing-value-confirming result: [`experiments/bench-005/README.md`](../experiments/bench-005/README.md)
- ADOPTION walkthrough: [`ADOPTION.en.md`](ADOPTION.en.md) / [`ADOPTION.ko.md`](ADOPTION.ko.md)
- Internal architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
