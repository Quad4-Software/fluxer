#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(cd "$HERE/.." && pwd)"
REPO_ROOT="$(cd "$DOCS_DIR/.." && pwd)"
SRC="$REPO_ROOT/fluxer_static/fonts"
DEST="$DOCS_DIR/docs/assets/fonts"

if [ ! -d "$SRC" ]; then
	echo "missing font source directory: $SRC" >&2
	exit 1
fi

mkdir -p "$DEST"
rsync -a --delete "$SRC/" "$DEST/"
