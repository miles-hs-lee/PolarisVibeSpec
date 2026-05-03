#!/usr/bin/env python3
"""Regenerate the embedded Mermaid diagrams in every ARCHITECTURE doc.

Each diagram block in `docs/ARCHITECTURE*.md` is delimited by HTML
comments:

    <!-- BEGIN diagram:<key> -->
    ```mermaid
    ...
    ```
    <!-- END diagram:<key> -->

This script runs `pv diagram` for every registered key and replaces the
fenced block in place across all ARCHITECTURE files (en + ko). The
mermaid output is language-neutral so the same body fills both. Run
after editing .polaris/graph.json. CI verifies no drift via
`npm run diagrams:check`.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCH_FILES = [
    REPO_ROOT / "docs" / "ARCHITECTURE.md",
    REPO_ROOT / "docs" / "ARCHITECTURE.ko.md",
]

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


def regen_one(arch: Path, rendered: dict[str, str]) -> tuple[bool, list[str]]:
    """Rewrite each marker block in one ARCHITECTURE file.

    Returns (ok, missing_keys). Missing keys means the file lacks
    a marker pair; the file is left untouched in that case.
    """
    if not arch.exists():
        return False, [f"file not found: {arch.relative_to(REPO_ROOT)}"]
    content = arch.read_text()
    missing: list[str] = []
    for key, body in rendered.items():
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
        return False, missing
    arch.write_text(content)
    return True, []


def main() -> int:
    rendered = {key: render(args) for key, args in DIAGRAMS}

    rc = 0
    for arch in ARCH_FILES:
        ok, missing = regen_one(arch, rendered)
        rel = arch.relative_to(REPO_ROOT)
        if not ok:
            print(f"⚠️  {rel}: {missing}", file=sys.stderr)
            rc = 1
            continue
        print(f"Regenerated {len(rendered)} diagram(s) in {rel}.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
