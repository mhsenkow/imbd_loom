#!/usr/bin/env bash
# Convenience wrappers from repo root
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "${1:-}" in
  download) (cd "$ROOT/pipeline" && uv run loom download "${@:2}") ;;
  parquet)  (cd "$ROOT/pipeline" && uv run loom parquet "${@:2}") ;;
  enrich)   (cd "$ROOT/pipeline" && uv run loom enrich "${@:2}") ;;
  build)    (cd "$ROOT/pipeline" && uv run loom build "${@:2}") ;;
  spike)    (cd "$ROOT/pipeline" && uv run loom spike "${@:2}") ;;
  verify)   python3 "$ROOT/scripts/verify.py" ;;
  dev)      (cd "$ROOT/app" && npm run dev) ;;
  export)   (cd "$ROOT/app" && npx tsx ../export/export-pdf.ts "${@:2}") ;;
  *)
    echo "Usage: $0 {download|parquet|enrich|build|spike|verify|dev|export}"
    exit 1
    ;;
esac
