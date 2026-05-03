# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Reframed value proposition.** After five benches, the project's
  framing leads with the documentation value (universal, agent-
  independent) rather than token-efficiency (real but conditional).
  The empirical numbers stand; the order in which we tell users to
  expect them changed. README, ADOPTION (en/ko), and the new
  [`docs/POSITIONING.md`](docs/POSITIONING.md) all reflect this.
- New [`docs/POSITIONING.md`](docs/POSITIONING.md) records the
  three-axis value framework (documentation / framing / routing),
  what each bench measured, where PV sits in the broader landscape
  (Structurizr / C4 / OpenAPI / ADRs / agent steering tools), and
  the open questions a future maintainer should re-derive from.

### Added

- `pv promote` — apply hand edits in `spec/<id>.md` back to `graph.json`.
  Prose fields (title, tags, description) are promoted; structural changes
  (id / type / domain / outgoing relations) are rejected with the exact
  alternative tool to use. Round-trip is idempotent: regenerate → no-edit
  → promote reports every node as `unchanged`. Skill routes "I edited
  some spec markdown, sync it back" requests to `pv promote`.
- `pv enrich <id> --prompt` — emit a structured prompt for an external
  coding agent to flesh out a stub node's description and infer missing
  relations from imports/exports.
- `--prompt` flag on `pv generate` and `pv bootstrap` — emit a
  self-contained prompt the agent can follow with its own Read/Edit
  tools, instead of PV calling an LLM API. Cleaner architecture: PV
  provides schema and conventions, the agent provides the LLM.
- `pv bootstrap` — heuristic graph + codemap scaffolder for existing
  codebases. Walks `src/` (or `--root <dir>`), classifies files by
  filename + content patterns, emits a draft to `.polaris/*.bootstrap.json`.
  Designed to take Phase 1 of adoption from 1-2 hours to ~30 minutes
  on a 200-file repo.
- `pv ask "<intent>"` — one-shot agent preamble combining intent
  classification, graph search, and impact for the top hit. Encodes
  the bench-002 finding that PV-vs-grep is task-shape dependent and
  routes the agent automatically.
- `pv export-all` — regenerate the entire human-readable `spec/`
  directory from the graph in one call. Used by the spec drift CI
  check.
- `pv validate` orphan source detection — flags files in `src/` that
  aren't referenced by any codemap entry.
- `--files-only` flag on `pv impact` and `--minimal` flag on `pv ask` —
  compact output for token-conscious agent flows.
- `coverage` field on `ImpactResult` (`narrow` / `broad` / `global`) —
  signals whether the impact set is narrow enough to trust or whether
  the agent should also fall back to grep.
- Bundled Claude Code skill at `skills/pv/` — auto-routes user requests
  to the right `pv` subcommand based on intent.
- Adoption guides at `docs/ADOPTION.en.md` and `docs/ADOPTION.ko.md`.
- Self-hosted: this repo's own `.polaris/graph.json` describes the PV
  codebase; `spec/` is the auto-generated human-readable view.
- Reproducible token-savings benchmarks at `experiments/bench-001`
  (7-file fixture) and `experiments/bench-002` (37-file, three task
  types, four CLAUDE.md variants).

### Changed

- Codemap paths are now stored with POSIX (`/`) separators so a graph
  authored on macOS/Linux is readable on Windows and vice versa.

### Fixed

- Windows path-separator bug in `pv bootstrap` and `pv validate`.

## [0.1.0] — 2026-05-03

Initial MVP: graph-backed spec layer for AI coding agents. Asymmetric
impact traversal, heuristic intent compiler, JSON graph + codemap, 10
CLI commands. See `experiments/README.md` for the empirical basis of
the design choices.

[Unreleased]: https://github.com/miles-hs-lee/PolarisVibeSpec/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/miles-hs-lee/PolarisVibeSpec/releases/tag/v0.1.0
