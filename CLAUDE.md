# PolarisVibeSpec — agent guide

This repo dogfoods its own product. `.polaris/graph.json` describes
this codebase; the `pv` CLI (build with `npm run build`) operates on it.

**Before any code change, run `pv ask "<intent>"`** and follow the
`classification.recommendation` field it returns (`use_pv` / `use_grep` /
`use_both`). The full spec is at [`spec/README.md`](spec/README.md). The
empirical basis — for the PV-vs-grep policy *and* for keeping this file
short — is in [`experiments/README.md`](experiments/README.md).

After editing `.polaris/graph.json`: `pv export-all` to regenerate `spec/`,
then `pv validate` before committing.
