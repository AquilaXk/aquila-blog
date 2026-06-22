#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRILL_SCRIPT="${ROOT_DIR}/deploy/homeserver/restore_external_backup_drill.sh"
WORKFLOW="${ROOT_DIR}/.github/workflows/backup-restore-drill.yml"
LAUNCH_GATE_DOC="${ROOT_DIR}/docs/design/launch-gate-operations.md"

require_file() {
  local file="$1"
  local message="$2"

  if [[ ! -f "${file}" ]]; then
    echo "missing: ${message}" >&2
    exit 1
  fi
}

require_executable() {
  local file="$1"
  local message="$2"

  if [[ ! -x "${file}" ]]; then
    echo "missing executable: ${message}" >&2
    exit 1
  fi
}

require_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"

  if ! grep -Eq "${pattern}" "${file}"; then
    echo "missing: ${message}" >&2
    exit 1
  fi
}

reject_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"

  if grep -Eq "${pattern}" "${file}"; then
    echo "unexpected: ${message}" >&2
    exit 1
  fi
}

require_pattern_count() {
  local file="$1"
  local pattern="$2"
  local expected="$3"
  local message="$4"
  local actual

  actual="$(grep -Ec "${pattern}" "${file}" || true)"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "expected ${expected}, got ${actual}: ${message}" >&2
    exit 1
  fi
}

require_file "${DRILL_SCRIPT}" "restore drill script"
require_executable "${DRILL_SCRIPT}" "restore drill script"
require_pattern "${DRILL_SCRIPT}" '^umask 077$' "restore drill must protect generated artifacts"
require_pattern "${DRILL_SCRIPT}" 'psql .*POSTGRES_DUMP_FILE|pg_restore .*POSTGRES_DUMP_FILE' "restore drill must restore the PostgreSQL dump"
require_pattern "${DRILL_SCRIPT}" 'backup-encryption\.key' "restore drill must default to the separated backup encryption key file"
require_pattern "${DRILL_SCRIPT}" 'AQUILA_RESTORE_PRIVACY_GATE_SCRIPT is required' "restore drill must require a restore privacy gate script"
require_pattern "${DRILL_SCRIPT}" 'openssl enc -d -aes-256-cbc -pbkdf2' "restore drill must decrypt encrypted backup artifacts"
require_pattern "${DRILL_SCRIPT}" 'flyway_schema_history' "restore drill must verify Flyway/schema state"
require_pattern "${DRILL_SCRIPT}" 'SELECT COUNT\(\*\) FROM post' "restore drill must verify restored post row count"
require_pattern "${DRILL_SCRIPT}" 'WHERE listed = true' "restore drill must query latest public post"
require_pattern "${DRILL_SCRIPT}" 'sha256sum' "restore drill must produce or compare MinIO object checksums"
require_pattern "${DRILL_SCRIPT}" 'minio-data\.tar\.gz\.enc' "restore drill must inspect encrypted MinIO backup tarball"
require_pattern "${DRILL_SCRIPT}" 'restore-privacy-gate\.txt' "restore drill must write privacy gate evidence"
require_pattern "${DRILL_SCRIPT}" '\^status=pass\$' "restore drill must require a passing privacy gate status"
require_pattern "${DRILL_SCRIPT}" 'restore-drill-summary\.md' "restore drill must write a human-readable summary artifact"
require_pattern "${DRILL_SCRIPT}" 'restore-drill-result\.env' "restore drill must write a machine-readable result artifact"
require_pattern "${DRILL_SCRIPT}" 'RPO' "restore drill must record RPO"
require_pattern "${DRILL_SCRIPT}" 'RTO' "restore drill must record RTO"
require_pattern "${DRILL_SCRIPT}" 'DB_IMAGE is required' "restore drill must require the production DB image"
require_pattern "${DRILL_SCRIPT}" 'created_at_utc' "restore drill must prefer UTC backup metadata for RPO"
require_pattern "${DRILL_SCRIPT}" 'read_key_from_file AQUILA_BACKUP_ROOT' "restore drill must read backup root from deploy env"
require_pattern "${DRILL_SCRIPT}" "awk 'NR == 1" "restore drill must select MinIO sample without head-induced SIGPIPE"
require_pattern "${DRILL_SCRIPT}" 'docker rm -f -v' "restore drill must remove anonymous PostgreSQL volumes"
reject_pattern "${DRILL_SCRIPT}" 'HOME_SERVER_ENV' "restore drill must not require raw production secret blobs"
reject_pattern "${DRILL_SCRIPT}" 'postgres:16-alpine' "restore drill must not default to vanilla PostgreSQL"

require_file "${WORKFLOW}" "manual restore drill workflow"
require_pattern "${WORKFLOW}" 'workflow_dispatch:' "restore drill workflow must be manually runnable"
require_pattern "${WORKFLOW}" 'restore_external_backup_drill\.sh' "restore drill workflow must run the drill script"
require_pattern "${WORKFLOW}" 'actions/upload-artifact@' "restore drill workflow must upload drill artifacts"
require_pattern "${WORKFLOW}" 'BACKUP_SET_ID' "restore drill workflow must accept or derive a backup set id"
require_pattern "${WORKFLOW}" 'unsafe backup_set_id' "restore drill workflow must validate backup set input before SSH"
require_pattern "${WORKFLOW}" 'RPO_TARGET_MINUTES.*=\~' "restore drill workflow must validate RPO target input before SSH"
require_pattern "${WORKFLOW}" 'RTO_TARGET_MINUTES.*=\~' "restore drill workflow must validate RTO target input before SSH"
require_pattern_count "${WORKFLOW}" '^[[:space:]]*scp .*ConnectTimeout=15' "2" "restore drill workflow scp calls must fail fast on connection timeout"

require_pattern "${LAUNCH_GATE_DOC}" 'Backup/restore drill' "launch gate must keep backup/restore evidence gate"
require_pattern "${LAUNCH_GATE_DOC}" 'restore_external_backup_drill\.sh' "launch gate must link restore drill script"
require_pattern "${LAUNCH_GATE_DOC}" 'RPO/RTO' "launch gate must document restore drill RPO/RTO evidence"

TMP_BASE="${TMPDIR:-/tmp}"
TMP_BASE="${TMP_BASE%/}"
WORK_DIR="$(mktemp -d "${TMP_BASE}/aquila-restore-drill-test.XXXXXX")"
trap 'rm -rf "${WORK_DIR}"' EXIT

BACKUP_ROOT="${WORK_DIR}/storage/backups"
BACKUP_SET_ID="20260101-010203"
POSTGRES_BACKUP_DIR="${BACKUP_ROOT}/postgres/daily/${BACKUP_SET_ID}"
MINIO_BACKUP_DIR="${BACKUP_ROOT}/minio/daily/${BACKUP_SET_ID}"
MINIO_SOURCE_DIR="${WORK_DIR}/minio-source"
FAKE_BIN_DIR="${WORK_DIR}/bin"
ARTIFACT_DIR="${WORK_DIR}/artifacts"
DEPLOY_DIR="${WORK_DIR}/deploy"
KEY_FILE="${WORK_DIR}/backup-encryption.key"
PRIVACY_GATE_SCRIPT="${WORK_DIR}/restore-privacy-gate.sh"
mkdir -p "${POSTGRES_BACKUP_DIR}" "${MINIO_BACKUP_DIR}" "${MINIO_SOURCE_DIR}/post-img/posts/2026/01" "${FAKE_BIN_DIR}" "${DEPLOY_DIR}"
printf 'test-backup-key\n' > "${KEY_FILE}"
chmod 600 "${KEY_FILE}"
cat > "${DEPLOY_DIR}/.env.prod" <<EOF
AQUILA_EXTERNAL_STORAGE_ROOT=${WORK_DIR}/storage
AQUILA_BACKUP_ROOT=${BACKUP_ROOT}
AQUILA_BACKUP_ENCRYPTION_KEY_FILE=${KEY_FILE}
AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=${PRIVACY_GATE_SCRIPT}
DB_IMAGE=jangka512/pgj@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EOF

cat > "${WORK_DIR}/dump.sql" <<'SQL'
CREATE TABLE flyway_schema_history(success boolean);
CREATE TABLE post(id bigint, listed boolean, created_at timestamptz);
SQL
openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${KEY_FILE}" -in "${WORK_DIR}/dump.sql" -out "${POSTGRES_BACKUP_DIR}/dump.sql.enc"
cat > "${POSTGRES_BACKUP_DIR}/metadata.env" <<'EOF'
backup_set_id=20260101-010203
class=daily
created_at=20260101-010203
created_at_utc=2026-01-01T01:02:03Z
encryption=openssl-enc-aes-256-cbc-pbkdf2
EOF
printf 'fixture-object\n' > "${MINIO_SOURCE_DIR}/post-img/posts/2026/01/sample.txt"
printf 'fixture-object-2\n' > "${MINIO_SOURCE_DIR}/post-img/posts/2026/01/zzz.txt"
tar -C "${MINIO_SOURCE_DIR}" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${KEY_FILE}" -out "${MINIO_BACKUP_DIR}/minio-data.tar.gz.enc"

cat > "${PRIVACY_GATE_SCRIPT}" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${BACKUP_SET_ID}" == "20260101-010203" ]]
[[ "${BACKUP_CLASS}" == "daily" ]]
[[ -n "${POSTGRES_CONTAINER}" ]]
[[ -s "${MINIO_CHECKSUM_FILE}" ]]
printf 'status=pass\n'
printf 'tombstone_replay=operator-gate-fixture\n'
printf 'traffic_open=blocked_until_gate_pass\n'
SH
chmod +x "${PRIVACY_GATE_SCRIPT}"

cat > "${FAKE_BIN_DIR}/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  run)
    echo "fake-postgres-container"
    ;;
  rm)
    exit 0
    ;;
  exec)
    shift
    if [[ "${1:-}" == "-i" ]]; then
      shift
      container="$1"
      shift
      if [[ "${1:-}" == "psql" ]]; then
        cat >/dev/null
        exit 0
      fi
      echo "unexpected docker exec -i command for ${container}: $*" >&2
      exit 1
    fi

    container="$1"
    shift
    case "${1:-}" in
      pg_isready)
        exit 0
        ;;
      psql)
        sql=""
        while [[ "$#" -gt 0 ]]; do
          if [[ "$1" == "-c" ]]; then
            shift
            sql="${1:-}"
            break
          fi
          shift
        done
        case "${sql}" in
          *flyway_schema_history*)
            echo "32"
            ;;
          *"COUNT(*) FROM post"*)
            echo "7"
            ;;
          *"SELECT id FROM post"*)
            echo "42"
            ;;
          *)
            echo "unexpected SQL: ${sql}" >&2
            exit 1
            ;;
        esac
        ;;
      *)
        echo "unexpected docker exec command for ${container}: $*" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "unexpected docker command: $*" >&2
    exit 1
    ;;
esac
SH
chmod +x "${FAKE_BIN_DIR}/docker"

PATH="${FAKE_BIN_DIR}:${PATH}" \
AQUILA_RESTORE_DRILL_BACKUP_SET_ID="${BACKUP_SET_ID}" \
AQUILA_RESTORE_DRILL_DEPLOY_DIR="${DEPLOY_DIR}" \
AQUILA_RESTORE_DRILL_ARTIFACT_DIR="${ARTIFACT_DIR}" \
AQUILA_RESTORE_DRILL_TIMESTAMP="20260102-030405" \
AQUILA_RESTORE_DRILL_NOW_EPOCH="1767323045" \
  "${DRILL_SCRIPT}" >/dev/null

grep -q '^STATUS=success$' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q '^BACKUP_SET_ID=20260101-010203$' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q 'POSTGRES_IMAGE=jangka512/pgj@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q '^RPO_ACTUAL_MINUTES=1562$' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q '^FLYWAY_SUCCESS_COUNT=32$' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q '^POST_ROW_COUNT=7$' "${ARTIFACT_DIR}/restore-drill-result.env"
grep -q '^LATEST_PUBLIC_POST_ID=42$' "${ARTIFACT_DIR}/restore-drill-result.env"
require_pattern "${ARTIFACT_DIR}/restore-drill-result.env" '^ENCRYPTION=openssl-enc-aes-256-cbc-pbkdf2$' "result.env must include encryption marker"
require_pattern "${ARTIFACT_DIR}/restore-drill-result.env" '^RESTORE_PRIVACY_GATE=pass$' "result.env must include privacy gate pass"
require_pattern "${ARTIFACT_DIR}/restore-drill-result.env" 'post-img/posts/2026/01/sample.txt' "result.env must include sampled object key"
require_pattern "${ARTIFACT_DIR}/restore-drill-summary.md" 'Backup Restore Drill Summary' "summary must be generated"
require_pattern "${ARTIFACT_DIR}/restore-drill-summary.md" 'Restore privacy gate: `pass`' "summary must include privacy gate status"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^tombstone_replay=operator-gate-fixture$' "privacy gate evidence must include tombstone replay marker"
grep -q 'post-img/posts/2026/01/sample.txt' "${ARTIFACT_DIR}/minio-checksums.sha256"

echo "[external-backup-restore-drill] ok"
