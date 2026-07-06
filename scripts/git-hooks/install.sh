#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/scripts/git-hooks"
GIT_HOOKS_DIR="$ROOT/.git/hooks"

if [[ ! -d "$GIT_HOOKS_DIR" ]]; then
	echo "error: $GIT_HOOKS_DIR does not exist; is this a git repository?" >&2
	exit 1
fi

for hook in pre-commit; do
	src="$HOOKS_DIR/$hook"
	dest="$GIT_HOOKS_DIR/$hook"
	if [[ ! -f "$src" ]]; then
		echo "error: missing hook script: $src" >&2
		exit 1
	fi
	chmod +x "$src" "$HOOKS_DIR/run-checks.sh"
	ln -sf "../../scripts/git-hooks/$hook" "$dest"
	echo "Installed $hook -> $dest"
done

echo "Git hooks installed. Skip once with FLUXER_SKIP_PRE_COMMIT=1 git commit ..."
