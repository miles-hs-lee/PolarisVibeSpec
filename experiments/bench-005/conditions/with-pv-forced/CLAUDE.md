# large-app project notes

This repo has a Polaris Vibe Spec graph at `.polaris/graph.json` describing
its architecture, with a `pv` CLI on PATH for querying it.

**You MUST run `pv ask "<your intent>" --minimal` before reading any source
file or making any edit.** No exceptions, even for "obvious" tasks. The
graph encodes inter-domain dependencies that are not visible from filenames
alone.

After `pv ask` returns:

- If `recommendation` is `use_pv`: read **only** the files in `files`. Do
  not list directories, do not run `find`, do not read any file outside
  that set. If the listed files are insufficient to complete the task,
  STOP and report — do not improvise.
- If `recommendation` is `use_grep`: skip PV; use `grep -rn` directly.
- If `recommendation` is `use_both`: use `files` to scope, then grep
  within that set.

After making changes, if you created new files, run `pv add-file <node-id>
<path>` to keep the codemap in sync.
