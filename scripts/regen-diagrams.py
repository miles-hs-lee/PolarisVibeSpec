#!/usr/bin/env python3
"""Regenerate the embedded Mermaid diagrams in docs/ARCHITECTURE.md.

Each diagram block in ARCHITECTURE.md is delimited by HTML comments:

    <!-- BEGIN diagram:<key> -->
    ```mermaid
    ...
    ```
    <!-- END diagram:<key> -->

This script runs `pv diagram` for every registered key and replaces the
fenced block in place. Run after editing .polaris/graph.json. CI verifies
no drift via `npm run diagrams:check`.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCH = REPO_ROOT / "docs" / "ARCHITECTURE.md"

# (key, pv-diagram args). Keep diagrams small (depth=1 mostly) — embedding
# 30-node graphs in a docs page hurts more than it helps.
DIAGRAMS: list[tuple[str, list[str]]] = [
    ("impact-analysis",     ["--node", "API-PV-IMPACT",  "--depth", "1"]),
    ("documentation-tools", ["--node", "REQ-PV-015",     "--depth", "1"]),
    ("agent-delegation",    ["--node", "REQ-PV-012",     "--depth", "1"]),
]


def render(args: list[str]) -> str:
    cli = REPO_ROOT / "dist" / "cli.js"
    out = subprocess.check_output(
        ["node", str(cli), "diagram", *args, "-f", "mermaid"],
        text=True,
    )
    return out.rstrip()


def main() -> int:
    content = ARCH.read_text()
    missing: list[str] = []

    for key, args in DIAGRAMS:
        body = render(args)
        # Pattern matches BEGIN line → existing block → END line. We
        # rewrite everything between the two comment markers.
        # Match the BEGIN marker, any (possibly empty) content, and the
        # END marker. Allows freshly-added empty marker pairs.
        pat = re.compile(
            rf"(<!-- BEGIN diagram:{re.escape(key)} -->).*?(<!-- END diagram:{re.escape(key)} -->)",
            re.DOTALL,
        )
        if not pat.search(content):
            missing.append(key)
            continue
        replacement = f"\\1\n\n```mermaid\n{body}\n```\n\n\\2"
        content = pat.sub(replacement, content)

    if missing:
        print(
            f"missing marker blocks in {ARCH.relative_to(REPO_ROOT)}: "
            + ", ".join(missing),
            file=sys.stderr,
        )
        print(
            "Add `<!-- BEGIN diagram:<key> --><!-- END diagram:<key> -->` "
            "where you want each diagram embedded.",
            file=sys.stderr,
        )
        return 1

    ARCH.write_text(content)
    print(f"Regenerated {len(DIAGRAMS)} diagram(s) in {ARCH.relative_to(REPO_ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
