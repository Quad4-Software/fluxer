#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMAND=upgrade
REF="${FLUXER_SELF_HOSTING_REF:-master}"
REPO="${FLUXER_SELF_HOSTING_REPO:-Quad4-Software/fluxer}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/deploy/self-hosting"
FORK_REGISTRY_OWNER="${FLUXER_FORK_REGISTRY_OWNER:-Quad4-Software}"

USE_FORK=true
SKIP_FILES=false
SKIP_PULL=false
SKIP_RESTART=false
DRY_RUN=false
VERIFY=false
NO_BACKUP=false
BACKUP_DATA=false
DOWN_TIMEOUT=60
RESTORE_TARGET=""
RESTORE_YES=false

STACK_FILES=(
	docker-compose.yml
	Caddyfile
	livekit.yaml
	.env.example
	setup.sh
	install.sh
	upgrade.sh
	backup-data.sh
	restore-data.sh
)

RESTORE_FILES=(
	docker-compose.yml
	Caddyfile
	livekit.yaml
	.env
	.env.example
)

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
	FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET
	LIVEKIT_API_SECRET
)

usage() {
	cat <<EOF
Usage: ./upgrade.sh [options]
       ./upgrade.sh restore [backup] [options]

Upgrade an existing self-hosted Fluxer stack: refresh stack files from this
repository, add any missing .env keys, generate new secrets (for example ALTCHA),
point images at the Quad4-Software fork when appropriate, then pull and restart
containers. Data volumes are preserved.

Restore rolls back stack files from a backup created during a previous upgrade.

Upgrade options:
  --ref REF                Git branch or tag for stack files (default: master)
  --repo REPO              GitHub repo (default: Quad4-Software/fluxer)
  --no-fork                Do not change FLUXER_REGISTRY_OWNER
  --skip-files             Do not download updated stack files
  --skip-pull              Do not run "docker compose pull"
  --skip-restart           Do not stop or start containers
  --down-timeout SECONDS   Grace period for "docker compose down" (default: 60)
  --no-backup              Skip backing up stack files before updating
  --backup-data            Run ./backup-data.sh before updating stack files
  --dry-run                Print actions without changing anything
  --verify                 Probe health endpoints after restart
  -h, --help               Show this help

Restore options:
  backup                   Backup id (for example 20260704T020910Z), path under
                           backups/, or "latest" (default: latest)
  --list                   List available backups and exit
  --yes                    Restore without confirmation
  --skip-restart           Restore files only
  --down-timeout SECONDS   Grace period for "docker compose down" (default: 60)
  --dry-run                Print actions without changing anything
  --verify                 Probe health endpoints after restart
  -h, --help               Show this help

Environment:
  FLUXER_SELF_HOSTING_REPO   Same as --repo
  FLUXER_SELF_HOSTING_REF    Same as --ref
  FLUXER_FORK_REGISTRY_OWNER Registry namespace (default: Quad4-Software)

Examples:
  ./upgrade.sh
  ./upgrade.sh --verify
  ./upgrade.sh restore --list
  ./upgrade.sh restore latest --verify
  ./upgrade.sh restore 20260704T020910Z --yes
EOF
}

if [[ $# -gt 0 && "$1" == "restore" ]]; then
	COMMAND=restore
	shift
fi

while [[ $# -gt 0 ]]; do
	case "$1" in
		--ref)
			REF="${2:-}"
			shift 2
			;;
		--repo)
			REPO="${2:-}"
			shift 2
			;;
		--no-fork)
			USE_FORK=false
			shift
			;;
		--skip-files)
			SKIP_FILES=true
			shift
			;;
		--skip-pull)
			SKIP_PULL=true
			shift
			;;
		--skip-restart)
			SKIP_RESTART=true
			shift
			;;
		--down-timeout)
			DOWN_TIMEOUT="${2:-}"
			shift 2
			;;
		--no-backup)
			NO_BACKUP=true
			shift
			;;
		--backup-data)
			BACKUP_DATA=true
			shift
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		--verify)
			VERIFY=true
			shift
			;;
		--list)
			COMMAND=restore-list
			shift
			;;
		--yes)
			RESTORE_YES=true
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		-*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [[ "$COMMAND" == restore && -z "$RESTORE_TARGET" ]]; then
				RESTORE_TARGET="$1"
				shift
			else
				echo "Unknown argument: $1" >&2
				usage >&2
				exit 1
			fi
			;;
	esac
done

BASE="https://raw.githubusercontent.com/${REPO}/${REF}/deploy/self-hosting"

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 1
	fi
}

run() {
	if [[ "$DRY_RUN" == true ]]; then
		printf '[dry-run]'; printf ' %q' "$@"; printf '\n'
	else
		"$@"
	fi
}

set_env() {
	local key="$1"
	local value="$2"
	if [[ "$DRY_RUN" == true ]]; then
		echo "[dry-run] set .env ${key}=..."
		return
	fi
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

env_has_key() {
	local key="$1"
	grep -q "^${key}=" .env
}

env_value() {
	local key="$1"
	grep -m1 "^${key}=" .env | cut -d= -f2- || true
}

env_needs_secret() {
	local key="$1"
	local value
	value="$(env_value "$key")"
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

merge_env_from_example() {
	local line key
	while IFS= read -r line || [[ -n "$line" ]]; do
		[[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
		[[ "$line" != *"="* ]] && continue
		key="${line%%=*}"
		if ! env_has_key "$key"; then
			if [[ "$DRY_RUN" == true ]]; then
				echo "[dry-run] append .env: ${line}"
			else
				printf '%s\n' "$line" >>.env
			fi
		fi
	done <.env.example
}

configure_fork_images() {
	if [[ "$USE_FORK" != true ]]; then
		return
	fi
	local owner
	owner="$(env_value FLUXER_REGISTRY_OWNER)"
	if [[ -z "$owner" || "$owner" == "fluxerapp" ]]; then
		if [[ "$owner" != "$FORK_REGISTRY_OWNER" ]]; then
			echo "Setting FLUXER_REGISTRY_OWNER=${FORK_REGISTRY_OWNER}"
			set_env FLUXER_REGISTRY_OWNER "$FORK_REGISTRY_OWNER"
		fi
	fi
	if ! env_has_key FLUXER_REGISTRY; then
		echo "Adding FLUXER_REGISTRY=ghcr.io/\${FLUXER_REGISTRY_OWNER}"
		set_env FLUXER_REGISTRY 'ghcr.io/${FLUXER_REGISTRY_OWNER}'
	fi
}

ensure_secrets() {
	local key
	for key in "${SECRET_KEYS[@]}"; do
		if env_needs_secret "$key"; then
			echo "Generating missing secret: ${key}"
			set_env "$key" "$(random_hex)"
		fi
	done
	if env_needs_secret FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64; then
		echo "Generating missing secret: FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64"
		set_env FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64 "$(random_base64)"
	fi
	if env_needs_secret FLUXER_VAPID_PUBLIC_KEY || env_needs_secret FLUXER_VAPID_PRIVATE_KEY; then
		echo "Generating missing VAPID keys"
		local vapid_json vapid_public vapid_private
		vapid_json="$(generate_vapid_keys)"
		vapid_public="$(printf '%s' "$vapid_json" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')"
		vapid_private="$(printf '%s' "$vapid_json" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')"
		if [[ -z "$vapid_public" || -z "$vapid_private" ]]; then
			echo "Failed to parse VAPID keys from generator output." >&2
			exit 1
		fi
		if env_needs_secret FLUXER_VAPID_PUBLIC_KEY; then
			set_env FLUXER_VAPID_PUBLIC_KEY "$vapid_public"
		fi
		if env_needs_secret FLUXER_VAPID_PRIVATE_KEY; then
			set_env FLUXER_VAPID_PRIVATE_KEY "$vapid_private"
		fi
	fi
}

backup_stack_files() {
	local backup_dir="$1"
	mkdir -p "$backup_dir"
	local file
	for file in "${RESTORE_FILES[@]}"; do
		if [[ -f "$file" ]]; then
			cp -a "$file" "${backup_dir}/"
		fi
	done
}

download_stack_files() {
	local file dest
	for file in "${STACK_FILES[@]}"; do
		echo "Downloading ${file} from ${REPO}@${REF}..."
		dest="$(mktemp)"
		if ! curl -fsSL "${BASE}/${file}" -o "$dest"; then
			rm -f "$dest"
			if [[ "$file" == "upgrade.sh" && -f "upgrade.sh" ]]; then
				echo "Keeping local upgrade.sh (remote copy not available yet)."
				continue
			fi
			echo "Failed to download ${file} from ${BASE}/${file}" >&2
			exit 1
		fi
		if [[ "$DRY_RUN" == true ]]; then
			echo "[dry-run] replace ${file} with upstream copy"
			rm -f "$dest"
		else
			mv "$dest" "$file"
		fi
	done
	if [[ "$DRY_RUN" != true ]]; then
		chmod +x setup.sh install.sh upgrade.sh backup-data.sh restore-data.sh 2>/dev/null || true
	fi
}

wait_for_health() {
	local domain scheme
	if [[ ! -f .env ]]; then
		echo "No .env file; skipping health checks." >&2
		return
	fi
	domain="$(env_value FLUXER_DOMAIN)"
	scheme="$(env_value FLUXER_PUBLIC_SCHEME)"
	[[ -z "$scheme" ]] && scheme=https
	if [[ -z "$domain" ]]; then
		echo "FLUXER_DOMAIN is not set; skipping health checks." >&2
		return
	fi
	echo "Waiting for health endpoints..."
	sleep 15
	local path code
	for path in /_health /api/_health /gateway/_health /media/_health /admin/_health; do
		code="$(curl -k -s -o /dev/null -w '%{http_code}' "${scheme}://${domain}${path}" || true)"
		printf '%s %s\n' "$path" "$code"
	done
}

list_backups() {
	if [[ ! -d backups ]]; then
		echo "No backups directory in ${SCRIPT_DIR}."
		return 1
	fi
	local found=false
	local entry name
	while IFS= read -r entry; do
		found=true
		name="$(basename "$entry")"
		printf '%s\n' "$name"
	done < <(find backups -mindepth 1 -maxdepth 1 -type d ! -name 'pre-restore-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | cut -d' ' -f2-)
	if [[ "$found" != true ]]; then
		echo "No backups found in ${SCRIPT_DIR}/backups."
		return 1
	fi
}

resolve_backup_dir() {
	local target="${1:-latest}"
	local candidate=""

	if [[ -z "$target" || "$target" == "latest" ]]; then
		candidate="$(find backups -mindepth 1 -maxdepth 1 -type d ! -name 'pre-restore-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
	elif [[ -d "$target" ]]; then
		candidate="$target"
	elif [[ -d "backups/${target}" ]]; then
		candidate="backups/${target}"
	else
		echo "Backup not found: ${target}" >&2
		echo "Use './upgrade.sh restore --list' to see available backups." >&2
		return 1
	fi

	if [[ -z "$candidate" || ! -d "$candidate" ]]; then
		echo "No backups found. Run './upgrade.sh' first (without --no-backup)." >&2
		return 1
	fi

	printf '%s' "$candidate"
}

restore_stack_files() {
	local backup_dir="$1"
	local file src
	for file in "${RESTORE_FILES[@]}"; do
		src="${backup_dir}/${file}"
		if [[ -f "$src" ]]; then
			if [[ "$DRY_RUN" == true ]]; then
				echo "[dry-run] restore ${file} from ${backup_dir}/"
			else
				cp -a "$src" "$file"
			fi
		fi
	done
	if [[ "$DRY_RUN" != true ]]; then
		chmod +x setup.sh install.sh upgrade.sh backup-data.sh restore-data.sh 2>/dev/null || true
	fi
}

restart_stack() {
	if [[ "$SKIP_PULL" != true ]]; then
		echo "Pulling container images..."
		run docker compose pull
	fi
	echo "Stopping stack (volumes are kept)..."
	run docker compose down --timeout "$DOWN_TIMEOUT"
	echo "Starting stack..."
	run docker compose up -d
	run docker compose ps
}

run_restore_list() {
	echo "Available backups (newest first):"
	list_backups
}

run_restore() {
	require_command docker
	docker compose version >/dev/null

	if [[ ! -f docker-compose.yml ]]; then
		echo "No docker-compose.yml in ${SCRIPT_DIR}. Run this script from your self-hosting directory." >&2
		exit 1
	fi

	local backup_dir
	backup_dir="$(resolve_backup_dir "${RESTORE_TARGET:-latest}")"

	echo "Restore source: ${backup_dir}"
	if [[ "$RESTORE_YES" != true && "$DRY_RUN" != true ]]; then
		echo "This will overwrite stack files in ${SCRIPT_DIR} and restart containers."
		read -r -p "Continue? [y/N] " confirm
		if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
			echo "Restore cancelled."
			exit 0
		fi
	fi

	local pre_restore_dir="backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
	echo "Backing up current stack files to ${pre_restore_dir}"
	run backup_stack_files "$pre_restore_dir"

	echo "Restoring stack files from ${backup_dir}..."
	restore_stack_files "$backup_dir"

	if [[ "$SKIP_RESTART" == true ]]; then
		echo "Skipping container restart (--skip-restart)."
		exit 0
	fi

	restart_stack

	if [[ "$VERIFY" == true ]]; then
		if [[ "$DRY_RUN" == true ]]; then
			echo "[dry-run] skip health checks"
		else
			wait_for_health
		fi
	fi

	cat <<EOF

Restore finished from ${backup_dir}.
A snapshot of the pre-restore files was saved to ${pre_restore_dir}.
EOF
}

run_upgrade() {
	require_command curl
	require_command openssl
	require_command docker
	docker compose version >/dev/null

	if [[ ! -f docker-compose.yml ]]; then
		echo "No docker-compose.yml in ${SCRIPT_DIR}. Run this script from your self-hosting directory." >&2
		exit 1
	fi

	if [[ ! -f .env ]]; then
		if [[ -f .env.example ]]; then
			echo "Creating .env from .env.example"
			cp .env.example .env
		else
			echo "Missing .env and .env.example in ${SCRIPT_DIR}" >&2
			exit 1
		fi
	fi

	if [[ "$BACKUP_DATA" == true ]]; then
		echo "Running data backup before upgrade..."
		if [[ "$DRY_RUN" == true ]]; then
			echo "[dry-run] ./backup-data.sh --yes"
		elif [[ -x ./backup-data.sh ]]; then
			./backup-data.sh --yes
		else
			echo "backup-data.sh is missing or not executable in ${SCRIPT_DIR}" >&2
			exit 1
		fi
	fi

	local backup_dir=""
	if [[ "$NO_BACKUP" != true && "$SKIP_FILES" != true ]]; then
		backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
		echo "Backing up stack files to ${backup_dir}"
		run backup_stack_files "$backup_dir"
	fi

	if [[ "$SKIP_FILES" != true ]]; then
		download_stack_files
	fi

	if [[ -f .env.example ]]; then
		echo "Merging missing keys from .env.example into .env (existing values are kept)"
		merge_env_from_example
	fi

	configure_fork_images
	ensure_secrets

	cat <<EOF

Upgrade preparation complete in ${SCRIPT_DIR}.
Stack source: ${REPO}@${REF}
Registry owner: $(env_value FLUXER_REGISTRY_OWNER)
Image tag: $(env_value FLUXER_IMAGE_TAG)
EOF

	if [[ -n "$backup_dir" && "$DRY_RUN" != true ]]; then
		echo "Backup saved to: ${backup_dir}"
	fi

	if [[ "$SKIP_RESTART" == true ]]; then
		echo "Skipping container restart (--skip-restart)."
		exit 0
	fi

	restart_stack

	if [[ "$VERIFY" == true ]]; then
		if [[ "$DRY_RUN" == true ]]; then
			echo "[dry-run] skip health checks"
		else
			wait_for_health
		fi
	fi

	cat <<EOF

Upgrade finished.

If images were switched to ghcr.io/${FORK_REGISTRY_OWNER}, publish or select a tag
that exists there (FLUXER_IMAGE_TAG in .env) before expecting new features.

To roll back stack files:
  ./upgrade.sh restore --list
  ./upgrade.sh restore latest --verify
EOF
	if [[ -n "$backup_dir" && "$DRY_RUN" != true ]]; then
		echo "  ./upgrade.sh restore $(basename "$backup_dir") --verify"
	fi
}

case "$COMMAND" in
	restore-list)
		run_restore_list
		;;
	restore)
		run_restore
		;;
	upgrade)
		run_upgrade
		;;
esac
