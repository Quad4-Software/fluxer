#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DOMAIN=""
START=false
VERIFY=false
CLOUDFLARE_TUNNEL=false
FORCE_SECRETS=false

usage() {
	cat <<'EOF'
Usage: ./setup.sh [options]

Prepare a self-hosted Fluxer stack: create .env, set the public hostname, and
generate required secrets.

Options:
  --domain HOST            Public hostname (for example chat.example.com)
  --cloudflare-tunnel      Listen on :80 inside Caddy for Cloudflare Tunnel
  --force-secrets          Regenerate secrets even if .env already has values
  --start                  Run "docker compose up -d" after setup
  --verify                 Check public health endpoints after --start
  -h, --help               Show this help

Examples:
  ./setup.sh --domain chat.example.com
  ./setup.sh --domain chat.example.com --start
  ./setup.sh --domain chat.example.com --cloudflare-tunnel --start --verify
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--domain)
			DOMAIN="${2:-}"
			shift 2
			;;
		--cloudflare-tunnel)
			CLOUDFLARE_TUNNEL=true
			shift
			;;
		--force-secrets)
			FORCE_SECRETS=true
			shift
			;;
		--start)
			START=true
			shift
			;;
		--verify)
			VERIFY=true
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
	esac
done

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 1
	fi
}

set_env() {
	local key="$1"
	local value="$2"
	local tmp
	tmp="$(mktemp)"
	if grep -q "^${key}=" .env; then
		awk -v key="$key" -v value="$value" '
			BEGIN { FS = "=" }
			$1 == key { print key "=" value; next }
			{ print }
		' .env >"$tmp"
	else
		cp .env "$tmp"
		printf '%s=%s\n' "$key" "$value" >>"$tmp"
	fi
	mv "$tmp" .env
}

env_needs_secret() {
	local key="$1"
	local value
	value="$(grep -m1 "^${key}=" .env | cut -d= -f2- || true)"
	[[ -z "$value" || "$value" == "CHANGE_ME" ]]
}

random_hex() {
	openssl rand -hex 32
}

random_base64() {
	openssl rand -base64 32
}

generate_vapid_keys() {
	if command -v npx >/dev/null 2>&1; then
		npx --yes web-push generate-vapid-keys --json
		return
	fi
	if docker info >/dev/null 2>&1; then
		docker run --rm node:24-alpine npx --yes web-push generate-vapid-keys --json
		return
	fi
	echo "Install Node.js (npx) or Docker to generate VAPID keys." >&2
	exit 1
}

require_command docker
require_command openssl
docker compose version >/dev/null

if [[ ! -f .env.example ]]; then
	echo "Missing .env.example in ${SCRIPT_DIR}" >&2
	exit 1
fi

if [[ ! -f .env ]]; then
	cp .env.example .env
	echo "Created .env from .env.example"
fi

if [[ -z "$DOMAIN" ]]; then
	read -r -p "Public hostname (for example chat.example.com): " DOMAIN
fi

if [[ -z "$DOMAIN" ]]; then
	echo "A public hostname is required. Pass --domain or enter one when prompted." >&2
	exit 1
fi

CADDY_SITE="$DOMAIN"
if [[ "$CLOUDFLARE_TUNNEL" == true ]]; then
	CADDY_SITE=":80"
fi

set_env FLUXER_DOMAIN "$DOMAIN"
set_env FLUXER_PUBLIC_SCHEME https
set_env FLUXER_PUBLIC_PORT 443
set_env FLUXER_CADDY_SITE_ADDRESS "$CADDY_SITE"
set_env FLUXER_VAPID_EMAIL "admin@${DOMAIN}"

SECRET_KEYS=(
	POSTGRES_PASSWORD
	MEILI_MASTER_KEY
	FLUXER_S3_SECRET_KEY
	FLUXER_SUDO_MODE_SECRET
	FLUXER_CONNECTION_INITIATION_SECRET
	FLUXER_GATEWAY_RPC_AUTH_TOKEN
	FLUXER_MEDIA_PROXY_SECRET_KEY
	FLUXER_ADMIN_SECRET_KEY_BASE
	FLUXER_ADMIN_OAUTH_CLIENT_SECRET
	LIVEKIT_API_SECRET
)

for key in "${SECRET_KEYS[@]}"; do
	if [[ "$FORCE_SECRETS" == true ]] || env_needs_secret "$key"; then
		set_env "$key" "$(random_hex)"
	fi
done

if [[ "$FORCE_SECRETS" == true ]] || env_needs_secret FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64; then
	set_env FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64 "$(random_base64)"
fi

if [[ "$FORCE_SECRETS" == true ]] || env_needs_secret FLUXER_VAPID_PUBLIC_KEY || env_needs_secret FLUXER_VAPID_PRIVATE_KEY; then
	VAPID_JSON="$(generate_vapid_keys)"
	VAPID_PUBLIC="$(printf '%s' "$VAPID_JSON" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')"
	VAPID_PRIVATE="$(printf '%s' "$VAPID_JSON" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')"
	if [[ -z "$VAPID_PUBLIC" || -z "$VAPID_PRIVATE" ]]; then
		echo "Failed to parse VAPID keys from generator output." >&2
		exit 1
	fi
	set_env FLUXER_VAPID_PUBLIC_KEY "$VAPID_PUBLIC"
	set_env FLUXER_VAPID_PRIVATE_KEY "$VAPID_PRIVATE"
fi

cat <<EOF

Setup complete for ${DOMAIN}.

Next steps:
  1. Point DNS at this server (or configure Cloudflare Tunnel).
  2. Open firewall ports 80/tcp, 443/tcp, and 7881/tcp + 7882/udp for voice.
  3. Start the stack: docker compose up -d
  4. Open https://${DOMAIN} and register the first account (it becomes admin).

EOF

if [[ "$START" == true ]]; then
	echo "Starting stack..."
	docker compose up -d
	docker compose ps
fi

if [[ "$VERIFY" == true ]]; then
	if [[ "$START" != true ]]; then
		echo "--verify requires a running stack; pass --start or start manually first." >&2
		exit 1
	fi
	echo "Waiting for health endpoints..."
	sleep 10
	for path in /_health /api/_health /gateway/_health /media/_health /admin/_health; do
		code="$(curl -k -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}${path}" || true)"
		printf '%s %s\n' "$path" "$code"
	done
fi
