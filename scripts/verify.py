#!/usr/bin/env python3
"""Pipeline sanity checks for IMDb Loom constructs.

Prefer `uv run loom verify` (recomputes degree/strength). This script remains
as a lightweight structural check for CI without the package entrypoint.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from loom.commands.verify import verify_all  # noqa: E402


def main() -> int:
    return verify_all()


if __name__ == "__main__":
    sys.exit(main())
