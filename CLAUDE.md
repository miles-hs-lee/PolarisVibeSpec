# PolarisVibeSpec — agent guide

This repo dogfoods its own product. `.polaris/graph.json` describes
this codebase; the `pv` CLI (build with `npm run build`) operates on
it. The full spec is at [`spec/README.md`](spec/README.md); the
project's own PRD is at [`docs/prd/CORE.md`](docs/prd/CORE.md).

## Workflow

**Before pushing a code change**, run the drift gate:

```
pv changed origin/main
```

It surfaces orphan source files (added without `pv add-file`),
broken codemap entries (file deleted while still referenced), and
the linked Intent nodes whose PRD sections may need updates. Exit
1 means something needs attention.

For non-trivial behavior changes, also run:

```
pv review origin/main --prompt > /tmp/review.md
```

Then read `/tmp/review.md` and follow its instructions: identify
intent-description updates, missing Intent nodes, PRD section
contradictions, or codemap link issues. Apply proposed patches via
`pv generate`, `pv promote`, `pv add-file`, or `pv link` after
human review.

## After editing `.polaris/graph.json`

```
pv export-all              # regenerate spec/<id>.md per node
pv validate                # graph integrity (CI also runs this)
```

## Optional helpers

- `pv why <path>` — reverse lookup, "what does this file
  implement?"
- `pv impact <id>` — focused file set for a node change (with a
  `coverage` indicator: narrow / broad / global)
- `pv ask "<free-form intent>"` — single-shot preamble that
  classifies the intent, queries the graph, and runs `impact` on
  the top hit. Useful when you don't already know which node to
  start from. Optional — skip if you already know the file or node
  you're touching.

The empirical basis for design decisions is in
[`experiments/README.md`](experiments/README.md). Keeping this file
short is intentional: bench notes confirm long agent steering text
doesn't pay off, so directives stay minimal and the spec carries
the detail.
