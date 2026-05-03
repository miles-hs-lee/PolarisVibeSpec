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

- **[Structurizr](https://structurizr.com/) / C4 model** — explicit
  architecture model in a DSL; output is diagrams. Same intent-first
  philosophy; different consumer (humans browsing diagrams vs. CLI +
  agent).
- **[arc42](https://arc42.org/)** — markdown architecture template.
  Static, no graph, no tooling.
- **Architectural Decision Records (ADRs)** — markdown decision logs
  in `docs/adr/`. Captures *why* decisions were made; does not map to
  files or expose a query API.

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
