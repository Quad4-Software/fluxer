#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKUP_ROOT="backups/data"
DRY_RUN=false
YES=false
SKIP_STOP=false
RESTORE_TARGET=""

S3_BUCKETS=(
	fluxer
	fluxer-uploads
	fluxer-downloads
	fluxer-reports
	fluxer-harvests
)

usage() {
	cat <<'EOF'
Usage: ./restore-data.sh [backup] [options]

Restore Postgres and SeaweedFS S3 data from a backup created by backup-data.sh.

Arguments:
  backup         Backup id, path under backups/data/, or "latest" (default: latest)

Options:
  --list         List available data backups and exit
  --dry-run      Print actions without changing anything
  --yes          Restore without confirmation
  --skip-stop    Do not stop api and worker before restore
  -h, --help     Show this help

Examples:
  ./restore-data.sh --list
  ./restore-data.sh latest --dry-run
  ./restore-data.sh 20260704T020910Z --yes
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run)
			DRY_RUN=true
			shift
			;;
		--yes)
			YES=true
			shift
			;;
		--skip-stop)
			SKIP_STOP=true
			shift
			;;
		--list)
			if [[ ! -d "$BACKUP_ROOT" ]]; then
				echo "No data backups in ${SCRIPT_DIR}/${BACKUP_ROOT}."
				exit 1
			fi
			find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' 2>/dev/null \
				| sort -nr \
				| cut -d' ' -f2-
			exit 0
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
			if [[ -z "$RESTORE_TARGET" ]]; then
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

env_value() {
	local key="$1"
	grep -m1 "^${key}=" .env 2>/dev/null | cut -d= -f2- || true
}

compose_network() {
	local project
	project="$(basename "$SCRIPT_DIR")"
	printf '%s_fluxer' "$project"
}

aws_cli() {
	local network access_key secret_key
	network="$(compose_network)"
	access_key="$(env_value FLUXER_S3_ACCESS_KEY)"
	secret_key="$(env_value FLUXER_S3_SECRET_KEY)"
	if [[ -z "$access_key" || -z "$secret_key" ]]; then
		echo "FLUXER_S3_ACCESS_KEY and FLUXER_S3_SECRET_KEY must be set in .env" >&2
		exit 1
	fi
	docker run --rm \
		--network "$network" \
		-e AWS_ACCESS_KEY_ID="$access_key" \
		-e AWS_SECRET_ACCESS_KEY="$secret_key" \
		-e AWS_DEFAULT_REGION=us-east-1 \
		-e AWS_EC2_METADATA_DISABLED=true \
		amazon/aws-cli:2.27.41 \
		--endpoint-url http://seaweedfs:8333 \
		"$@"
}

resolve_backup_dir() {
	local target="${1:-latest}"
	local candidate=""

	if [[ -z "$target" || "$target" == "latest" ]]; then
		if [[ -f "${BACKUP_ROOT}/latest-meta.json" ]]; then
			candidate="$(jq -r '.backup_dir // empty' "${BACKUP_ROOT}/latest-meta.json")"
		fi
		if [[ -z "$candidate" || ! -d "$candidate" ]]; then
			candidate="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
		fi
	elif [[ -d "$target" ]]; then
		candidate="$target"
	elif [[ -d "${BACKUP_ROOT}/${target}" ]]; then
		candidate="${BACKUP_ROOT}/${target}"
	else
		echo "Backup not found: ${target}" >&2
		echo "Use './restore-data.sh --list' to see available backups." >&2
		return 1
	fi

	if [[ -z "$candidate" || ! -d "$candidate" ]]; then
		echo "No data backups found under ${BACKUP_ROOT}/." >&2
		return 1
	fi

	printf '%s' "$candidate"
}

require_command docker
require_command jq
docker compose version >/dev/null

if [[ ! -f docker-compose.yml ]]; then
	echo "No docker-compose.yml in ${SCRIPT_DIR}." >&2
	exit 1
fi

if [[ ! -f .env ]]; then
	echo "Missing .env in ${SCRIPT_DIR}." >&2
	exit 1
fi

BACKUP_DIR="$(resolve_backup_dir "${RESTORE_TARGET:-latest}")"
POSTGRES_DUMP="${BACKUP_DIR}/postgres/fluxer.sql.gz"
S3_DIR="${BACKUP_DIR}/s3"

if [[ ! -f "$POSTGRES_DUMP" ]]; then
	echo "Missing Postgres dump: ${POSTGRES_DUMP}" >&2
	exit 1
fi

if [[ ! -d "$S3_DIR" ]]; then
	echo "Missing S3 backup directory: ${S3_DIR}" >&2
	exit 1
fi

echo "Restore source: ${BACKUP_DIR}"
if [[ -f "${BACKUP_DIR}/meta.json" ]]; then
	jq -r '"Backup timestamp: \(.timestamp), success: \(.success), size: \(.size_bytes) bytes"' "${BACKUP_DIR}/meta.json"
fi

if [[ "$YES" != true ]]; then
	echo "This overwrites the fluxer database and S3 bucket contents."
	read -r -p "Continue? [y/N] " confirm
	if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
		echo "Restore cancelled."
		exit 0
	fi
fi

if [[ "$SKIP_STOP" != true ]]; then
	echo "Stopping api and worker..."
	run docker compose stop api worker
fi

echo "Restoring Postgres..."
if [[ "$DRY_RUN" == true ]]; then
	run sh -c "gunzip -c '${POSTGRES_DUMP}' | docker compose exec -T postgres psql -U fluxer -d fluxer"
else
	gunzip -c "$POSTGRES_DUMP" | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U fluxer -d fluxer >/dev/null
fi

for bucket in "${S3_BUCKETS[@]}"; do
	if [[ ! -d "${S3_DIR}/${bucket}" ]]; then
		echo "Skipping missing bucket backup: ${bucket}" >&2
		continue
	fi
	echo "Restoring bucket ${bucket}..."
	run aws_cli s3 sync "${S3_DIR}/${bucket}/" "s3://${bucket}/" --delete --only-show-errors
done

if [[ "$SKIP_STOP" != true && "$DRY_RUN" != true ]]; then
	echo "Starting api and worker..."
	run docker compose start api worker
fi

cat <<EOF

Data restore finished from ${BACKUP_DIR}.
Restart the full stack if you stopped additional services.
EOF
