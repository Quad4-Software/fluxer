#!/usr/bin/env bash
set -euo pipefail

REF="${FLUXER_SELF_HOSTING_REF:-master}"
REPO="${FLUXER_SELF_HOSTING_REPO:-Quad4-Software/fluxer}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/deploy/self-hosting"
TARGET_DIR="fluxer"

usage() {
	cat <<EOF
Usage: ./install.sh [target-dir] [setup.sh options]

Download the Fluxer self-hosting stack and run setup.

Environment:
  FLUXER_SELF_HOSTING_REPO   GitHub repo (default: Quad4-Software/fluxer)
  FLUXER_SELF_HOSTING_REF    Git branch or tag (default: master)

Examples:
  curl -fsSL "\$BASE/install.sh" | bash -s -- --domain chat.example.com --start
  ./install.sh fluxer --domain chat.example.com --start
  FLUXER_SELF_HOSTING_REPO=fluxerapp/fluxer ./install.sh --domain chat.example.com
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

if [[ $# -gt 0 && "$1" != --* ]]; then
	TARGET_DIR="$1"
	shift
fi

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 1
	fi
}

require_command curl
require_command bash

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

for file in docker-compose.yml Caddyfile livekit.yaml .env.example setup.sh install.sh upgrade.sh; do
	echo "Downloading ${file}..."
	curl -fsSLO "${BASE}/${file}"
done

chmod +x setup.sh install.sh upgrade.sh

if [[ ! -f .env ]]; then
	cp .env.example .env
fi

exec ./setup.sh "$@"
