# Contributing to Polaris Vibe Spec

Thanks for your interest. PV is small enough that one person can hold it in
their head — please help keep it that way.

## Setting up

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install
npm run build       # → dist/cli.js
npm run validate    # → graph integrity check (must pass)
npm run spec:check  # → spec/ stays in sync with graph (must pass)
```

Node 18+ required.

## Working with the graph

This repo dogfoods its own product. Before making code changes:

```bash
node dist/cli.js ask "<your intent>" --minimal
```

Follow the `recommendation` it returns:

| recommendation | What to do |
|---|---|
| `use_pv` | Read only the files in `files`. |
| `use_grep` | Skip PV. Use `grep -rn` on the textual target. |
| `use_both` | Use PV's `files` to scope, then grep within that set. |

After any code change that adds or modifies `.polaris/graph.json` or any
codemap entries, run `node dist/cli.js export-all` to refresh `spec/`
before committing — CI fails if `spec/` drifts.

If you add a new source file, run `node dist/cli.js add-file <node-id> <path>`
so the codemap stays in sync.

## Pull requests

- Keep changes focused. One PR per feature or bug fix.
- Write commit messages in the existing style: a short subject, then a
  body explaining *why* (the *what* lives in the diff).
- Include the empirical or design basis when it affects observable
  behavior (token cost, output shape, agent routing). The `experiments/`
  directory is the canonical record.
- If you change a CLI flag or output schema, update:
  - The relevant `spec/API-PV-*.md` description (via the graph node, not
    by editing the markdown directly — `pv export-all` regenerates).
  - `docs/ADOPTION.en.md` and `docs/ADOPTION.ko.md` if the change
    affects the user-facing workflow.
  - The bundled skill at `skills/pv/SKILL.md` if the change affects
    agent routing.

## What to avoid

- **Long CLAUDE.md or skill text.** `experiments/bench-002` showed that
  doc length itself dominates rename-task cost. Keep
  agent-facing docs minimal; trust the tools to communicate via output.
- **Adding LLM API clients inside PV.** PV is a local CLI. LLM-shaped
  work is delegated to the user's coding agent via `--prompt` mode.
  This is intentional architecture, not a missing feature.
- **Markdown as a source of truth.** `spec/` is a generated view.
  `pv promote` only accepts prose changes; structural changes go through
  the JSON or `pv link`.
- **Heavy, hand-written graphs in tests or examples.** Use
  `pv bootstrap` to scaffold, then curate.

## Reporting issues

Bug reports and feature requests go to
[GitHub Issues](https://github.com/miles-hs-lee/PolarisVibeSpec/issues).
There are bug and feature templates — please use them. For security
issues see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the MIT
License (see [LICENSE](LICENSE)).
