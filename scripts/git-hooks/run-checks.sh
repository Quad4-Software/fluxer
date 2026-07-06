#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

RUN_ALL=0
if [[ "${1:-}" == "--all" ]]; then
	RUN_ALL=1
fi

STAGED="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
FAILED=0

has_staged() {
	if [[ "$RUN_ALL" -eq 1 ]]; then
		return 0
	fi
	echo "$STAGED" | grep -Eq "$1"
}

fail() {
	echo "pre-commit: $*" >&2
	FAILED=1
}

if has_staged '\.rs$'; then
	echo "Checking Rust formatting..."
	if ! cargo fmt --all -- --check; then
		fail "Rust formatting failed. Run: cargo fmt --all"
	fi
fi

if has_staged '^fluxer_gateway/.*\.(erl|hrl|app\.src)$' || has_staged '^fluxer_gateway/rebar\.config'; then
	echo "Checking gateway formatting..."
	if ! command -v rebar3 >/dev/null 2>&1; then
		fail "rebar3 is required for gateway formatting checks"
	elif ! (cd fluxer_gateway && rebar3 fmt --check); then
		fail "Gateway formatting failed. Run: cd fluxer_gateway && rebar3 fmt"
	fi
fi

if has_staged '^(fluxer_api/src/api/|fluxer_admin/|packages/openapi/|packages/schema/|packages/errors/)'; then
	echo "Checking OpenAPI schema drift..."
	if ! command -v pnpm >/dev/null 2>&1; then
		fail "pnpm is required for OpenAPI drift checks"
	else
		pnpm openapi:generate >/dev/null
		if ! git diff --exit-code -- fluxer_api/src/api/openapi/openapi.json fluxer_admin/openapi-admin.json; then
			fail "OpenAPI specs are outdated. Run: pnpm openapi:generate"
		fi
	fi
fi

if [[ "$RUN_ALL" -eq 1 ]] && has_staged '^(fluxer_app/|fluxer_api/|fluxer_desktop/|fluxer_admin/|fluxer_marketing/|packages/|scripts/|knip\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)'; then
	echo "Checking for unused files and exports (knip)..."
	if ! command -v pnpm >/dev/null 2>&1; then
		fail "pnpm is required for knip checks"
	elif [[ ! -d node_modules ]]; then
		fail "node_modules is missing. Run: pnpm install"
	else
		if ! pnpm --filter fluxer_app wasm:codegen >/dev/null 2>&1; then
			fail "fluxer_app wasm:codegen failed"
		elif ! pnpm --filter fluxer_app generate:masks >/dev/null 2>&1; then
			fail "fluxer_app generate:masks failed"
		elif ! pnpm --filter fluxer_app i18n:compile >/dev/null 2>&1; then
			fail "fluxer_app i18n:compile failed"
		elif ! pnpm exec knip; then
			fail "knip found unused files, dependencies, or exports"
		fi
	fi
fi

if [[ "$FAILED" -ne 0 ]]; then
	exit 1
fi

if [[ "$RUN_ALL" -eq 1 ]] || [[ -n "$STAGED" ]]; then
	echo "Pre-commit checks passed."
fi

exit 0
