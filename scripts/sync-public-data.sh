#!/usr/bin/env bash
# Copy construct JSON into app/public/data for static builds (GitHub Pages).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/out"
DEST="$ROOT/app/public/data"

if [[ ! -f "$SRC/index.json" ]]; then
  echo "Missing $SRC/index.json — run: cd pipeline && uv run loom build" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
# Skip spike scratch
rsync -a --exclude '_spike' "$SRC/" "$DEST/"
echo "Synced construct JSON → app/public/data"
