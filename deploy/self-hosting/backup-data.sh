#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKUP_ROOT="backups/data"
META_LATEST="${BACKUP_ROOT}/latest-meta.json"
DRY_RUN=false
YES=false
BACKUP_ID=""

S3_BUCKETS=(
	fluxer
	fluxer-uploads
	fluxer-downloads
	fluxer-reports
	fluxer-harvests
)

usage() {
	cat <<'EOF'
Usage: ./backup-data.sh [options]

Create a data backup of Postgres and SeaweedFS S3 buckets for this stack.
Metadata is written to backups/data/latest-meta.json.

Options:
  --id ID        Backup directory name (default: UTC timestamp)
  --dry-run      Print actions without changing anything
  --yes          Skip confirmation when the stack is running
  -h, --help     Show this help

Examples:
  ./backup-data.sh
  ./backup-data.sh --dry-run
  ./backup-data.sh --id manual-20260704
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--id)
			BACKUP_ID="${2:-}"
			shift 2
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		--yes)
			YES=true
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

dir_size_bytes() {
	local target="$1"
	if [[ ! -d "$target" ]]; then
		printf '0'
		return
	fi
	du -sb "$target" 2>/dev/null | cut -f1 || printf '0'
}

write_metadata() {
	local backup_dir="$1"
	local success="$2"
	local postgres_ok="$3"
	local postgres_path="$4"
	local postgres_size="$5"
	local s3_ok="$6"
	local s3_size="$7"
	local total_size="$8"
	local timestamp="$9"

	local meta_tmp
	meta_tmp="$(mktemp)"
	cat >"$meta_tmp" <<EOF
{
  "timestamp": "${timestamp}",
  "success": ${success},
  "backup_dir": "${backup_dir}",
  "size_bytes": ${total_size},
  "components": {
    "postgres": {
      "success": ${postgres_ok},
      "path": "${postgres_path}",
      "size_bytes": ${postgres_size}
    },
    "s3": {
      "success": ${s3_ok},
      "buckets": $(printf '%s\n' "${S3_BUCKETS[@]}" | jq -R . | jq -s .),
      "path": "s3",
      "size_bytes": ${s3_size}
    }
  }
}
EOF

	if [[ "$DRY_RUN" == true ]]; then
		echo "[dry-run] write metadata to ${backup_dir}/meta.json and ${META_LATEST}"
		rm -f "$meta_tmp"
		return
	fi

	mkdir -p "$BACKUP_ROOT"
	cp "$meta_tmp" "${backup_dir}/meta.json"
	cp "$meta_tmp" "$META_LATEST"
	rm -f "$meta_tmp"
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

if [[ -z "$BACKUP_ID" ]]; then
	BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
fi

BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_ID}"

if docker compose ps --status running --services 2>/dev/null | grep -q .; then
	if [[ "$YES" != true && "$DRY_RUN" != true ]]; then
		echo "Some services are running. For a consistent Postgres dump, consider stopping api and worker first."
		read -r -p "Continue anyway? [y/N] " confirm
		if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
			echo "Backup cancelled."
			exit 0
		fi
	fi
fi

echo "Backing up data to ${BACKUP_DIR}"

POSTGRES_OK=false
S3_OK=false
POSTGRES_SIZE=0
S3_SIZE=0

if [[ "$DRY_RUN" == true ]]; then
	run mkdir -p "${BACKUP_DIR}/postgres" "${BACKUP_DIR}/s3"
	run docker compose exec -T postgres pg_dump -U fluxer -d fluxer
	for bucket in "${S3_BUCKETS[@]}"; do
		run aws_cli s3 sync "s3://${bucket}" "${BACKUP_DIR}/s3/${bucket}/"
	done
	write_metadata "$BACKUP_DIR" true true "postgres/fluxer.sql.gz" 0 true 0 0 "$BACKUP_ID"
	echo "Dry run complete."
	exit 0
fi

mkdir -p "${BACKUP_DIR}/postgres" "${BACKUP_DIR}/s3"

set +e
if docker compose exec -T postgres pg_dump --clean --if-exists -U fluxer -d fluxer | gzip -c >"${BACKUP_DIR}/postgres/fluxer.sql.gz"; then
	POSTGRES_OK=true
	POSTGRES_SIZE="$(dir_size_bytes "${BACKUP_DIR}/postgres")"
else
	echo "Postgres backup failed." >&2
fi
set -e

set +e
for bucket in "${S3_BUCKETS[@]}"; do
	echo "Syncing bucket ${bucket}..."
	if ! aws_cli s3 sync "s3://${bucket}" "${BACKUP_DIR}/s3/${bucket}/" --only-show-errors; then
		echo "S3 backup failed for bucket ${bucket}." >&2
		S3_OK=false
		break
	fi
	S3_OK=true
done
set -e

if [[ "$S3_OK" == true ]]; then
	S3_SIZE="$(dir_size_bytes "${BACKUP_DIR}/s3")"
fi

TOTAL_SIZE=$((POSTGRES_SIZE + S3_SIZE))
SUCCESS=false
if [[ "$POSTGRES_OK" == true && "$S3_OK" == true ]]; then
	SUCCESS=true
fi

write_metadata "$BACKUP_DIR" "$SUCCESS" "$POSTGRES_OK" "postgres/fluxer.sql.gz" "$POSTGRES_SIZE" "$S3_OK" "$S3_SIZE" "$TOTAL_SIZE" "$BACKUP_ID"

if [[ "$SUCCESS" != true ]]; then
	echo "Backup finished with errors. See ${BACKUP_DIR}/meta.json" >&2
	exit 1
fi

cat <<EOF

Data backup complete.
Directory: ${BACKUP_DIR}
Metadata: ${META_LATEST}
Total size: ${TOTAL_SIZE} bytes
EOF
