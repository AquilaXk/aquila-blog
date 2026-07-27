#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRILL_SCRIPT="${ROOT_DIR}/deploy/homeserver/restore_external_backup_drill.sh"
PRIVACY_GATE_SCRIPT="${ROOT_DIR}/restore-privacy-gate.sh"
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
require_file "${PRIVACY_GATE_SCRIPT}" "tracked restore privacy gate"
require_executable "${PRIVACY_GATE_SCRIPT}" "tracked restore privacy gate"
require_pattern "${DRILL_SCRIPT}" '^umask 077$' "restore drill must protect generated artifacts"
require_pattern "${DRILL_SCRIPT}" 'psql .*POSTGRES_DUMP_FILE|pg_restore .*POSTGRES_DUMP_FILE' "restore drill must restore the PostgreSQL dump"
require_pattern "${DRILL_SCRIPT}" 'backup-encryption\.key' "restore drill must default to the separated backup encryption key file"
require_pattern "${DRILL_SCRIPT}" 'AQUILA_RESTORE_PRIVACY_GATE_SCRIPT is required' "restore drill must require a restore privacy gate script"
require_pattern "${DRILL_SCRIPT}" 'canonical_path_for_compare' "restore drill must compare canonical paths before exclusion checks"
require_pattern "${DRILL_SCRIPT}" 'assert_outside_backup_root "AQUILA_BACKUP_ENCRYPTION_KEY_FILE"' "restore drill must keep backup key outside backup root"
require_pattern "${DRILL_SCRIPT}" 'read_key_from_file encryption_key_file' "restore drill must prefer the selected backup metadata encryption key"
require_pattern "${DRILL_SCRIPT}" 'openssl enc -d -aes-256-cbc -pbkdf2' "restore drill must decrypt encrypted backup artifacts"
require_pattern "${DRILL_SCRIPT}" 'AQUILA_RESTORE_DRILL_DECRYPT_DIR' "restore drill decrypt workspace must be configurable"
require_pattern "${DRILL_SCRIPT}" 'BACKUP_ROOT}/\.restore-drill-decrypted' "restore drill decrypt workspace must default to the backup volume"
require_pattern "${DRILL_SCRIPT}" 'df -Pk' "restore drill must check decrypt workspace free space"
reject_pattern "${DRILL_SCRIPT}" 'mktemp -d /tmp/aquila-restore-drill-decrypted' "restore drill must not hard-code decrypted backups under root /tmp"
require_pattern "${DRILL_SCRIPT}" 'flyway_schema_history' "restore drill must verify Flyway/schema state"
require_pattern "${DRILL_SCRIPT}" 'SELECT COUNT\(\*\) FROM post' "restore drill must verify restored post row count"
require_pattern "${DRILL_SCRIPT}" 'WHERE listed = true' "restore drill must query latest public post"
require_pattern "${DRILL_SCRIPT}" 'sha256sum' "restore drill must produce or compare MinIO object checksums"
require_pattern "${DRILL_SCRIPT}" 'minio-data\.tar\.gz\.enc' "restore drill must inspect encrypted MinIO backup tarball"
require_pattern "${DRILL_SCRIPT}" 'restore-privacy-gate\.txt' "restore drill must write privacy gate evidence"
require_pattern "${DRILL_SCRIPT}" '\^status=pass\$' "restore drill must require a passing privacy gate status"
require_pattern "${DRILL_SCRIPT}" 'LATEST_MEMBER_TOMBSTONE_FILE' "restore drill must prepare latest member tombstone evidence"
require_pattern "${DRILL_SCRIPT}" 'CURRENT_MINIO_OBJECT_KEY_FILE' "restore drill must prepare current MinIO logical keys"
require_pattern "${DRILL_SCRIPT}" 'RESTORED_MINIO_OBJECT_KEY_FILE' "restore drill must prepare restored MinIO logical keys"
require_pattern "${DRILL_SCRIPT}" 'mc --json ls --recursive (current|restored)' "restore drill must inventory logical MinIO objects through the S3 API"
reject_pattern "${DRILL_SCRIPT}" 'find \. -type f' "restore drill must not treat MinIO physical files as logical objects"
require_pattern "${DRILL_SCRIPT}" 'assert_latest_privacy_evidence_stable' "restore drill must reject deletion state changes during the gate"
require_pattern "${DRILL_SCRIPT}" 'comm -23.*CURRENT_MINIO_OBJECT_KEY_FILE.*CURRENT_MINIO_OBJECT_KEY_AFTER_FILE' "restore drill must reject MinIO deletions during the gate"
require_pattern "${DRILL_SCRIPT}" 'validate_minio_archive_for_extract' "restore drill must validate the MinIO archive before extraction"
require_pattern "${DRILL_SCRIPT}" 'assert_minio_extraction_capacity' "restore drill must reserve extraction capacity before unpacking MinIO data"
require_pattern "${DRILL_SCRIPT}" 'AQUILA_BACKUP_MIN_FREE_PERCENT' "restore drill extraction must preserve the existing backup free-space reserve"
reject_pattern "${DRILL_SCRIPT}" 'printf.*object_key.*sha256sum' "restore drill must not spawn a hasher per logical object"
require_pattern "${PRIVACY_GATE_SCRIPT}" '\\copy latest_tombstones' "privacy gate must stream accumulated tombstones through PostgreSQL COPY"
reject_pattern "${PRIVACY_GATE_SCRIPT}" 'WITH latest\(member_id\) AS \(VALUES' "privacy gate must not place every tombstone in one process argument"
require_pattern "${DRILL_SCRIPT}" 'restore-drill-summary\.md' "restore drill must write a human-readable summary artifact"
require_pattern "${DRILL_SCRIPT}" 'restore-drill-result\.env' "restore drill must write a machine-readable result artifact"
require_pattern "${DRILL_SCRIPT}" 'RPO' "restore drill must record RPO"
require_pattern "${DRILL_SCRIPT}" 'RTO' "restore drill must record RTO"
require_pattern "${DRILL_SCRIPT}" 'DB_IMAGE is required' "restore drill must require the production DB image"
require_pattern "${DRILL_SCRIPT}" 'created_at_utc' "restore drill must prefer UTC backup metadata for RPO"
require_pattern "${DRILL_SCRIPT}" 'read_key_from_file AQUILA_BACKUP_ROOT' "restore drill must read backup root from deploy env"
require_pattern "${DRILL_SCRIPT}" 'first == "".*END.*first' "restore drill must select MinIO sample without head-induced SIGPIPE"
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
PRIVACY_DB_CONTAINER="aquila-restore-drill-test-${RANDOM}-$$"
PRIVACY_DB_IMAGE="jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7"
MINIO_FIXTURE_IMAGE="minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"
MINIO_SOURCE_CONTAINER="aquila-restore-minio-source-${RANDOM}-$$"
MINIO_LIVE_CONTAINER="aquila-restore-minio-live-${RANDOM}-$$"
REAL_DOCKER="$(command -v docker)"
REAL_DF="$(command -v df)"
REAL_TAR="$(command -v tar)"

cleanup() {
  docker rm -f -v "${PRIVACY_DB_CONTAINER}" >/dev/null 2>&1 || true
  "${REAL_DOCKER}" rm -f -v "${MINIO_SOURCE_CONTAINER}" "${MINIO_LIVE_CONTAINER}" >/dev/null 2>&1 || true
  "${REAL_DOCKER}" ps -aq --filter 'name=^/aquila-restore-drill-minio-2026010[23]-' \
    | while IFS= read -r container_id; do
      [[ -n "${container_id}" ]] && "${REAL_DOCKER}" rm -f -v "${container_id}" >/dev/null 2>&1 || true
    done
  rm -rf "${WORK_DIR}"
}

trap cleanup EXIT

BACKUP_ROOT="${WORK_DIR}/storage/backups"
BACKUP_SET_ID="20260101-010203"
POSTGRES_BACKUP_DIR="${BACKUP_ROOT}/postgres/daily/${BACKUP_SET_ID}"
MINIO_BACKUP_DIR="${BACKUP_ROOT}/minio/daily/${BACKUP_SET_ID}"
MINIO_SOURCE_DIR="${WORK_DIR}/minio-source"
FAKE_BIN_DIR="${WORK_DIR}/bin"
UNSAFE_ARCHIVE_BIN_DIR="${WORK_DIR}/unsafe-archive-bin"
ARTIFACT_DIR="${WORK_DIR}/artifacts"
DEPLOY_DIR="${WORK_DIR}/deploy"
KEY_FILE="${WORK_DIR}/backup-encryption.key"
ROTATED_KEY_FILE="${WORK_DIR}/rotated-backup-encryption.key"
mkdir -p "${POSTGRES_BACKUP_DIR}" "${MINIO_BACKUP_DIR}" "${MINIO_SOURCE_DIR}" "${WORK_DIR}/storage/minio" "${FAKE_BIN_DIR}" "${UNSAFE_ARCHIVE_BIN_DIR}" "${DEPLOY_DIR}"
cp "${ROOT_DIR}/deploy/homeserver/docker-compose.prod.yml" "${DEPLOY_DIR}/docker-compose.prod.yml"
printf 'test-backup-key\n' > "${KEY_FILE}"
printf 'rotated-backup-key\n' > "${ROTATED_KEY_FILE}"
chmod 600 "${KEY_FILE}"
chmod 600 "${ROTATED_KEY_FILE}"
cat > "${DEPLOY_DIR}/.env.prod" <<EOF
AQUILA_EXTERNAL_STORAGE_ROOT=${WORK_DIR}/storage
AQUILA_BACKUP_ROOT=${BACKUP_ROOT}
AQUILA_BACKUP_ENCRYPTION_KEY_FILE=${ROTATED_KEY_FILE}
AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=${PRIVACY_GATE_SCRIPT}
DB_IMAGE=jangka512/pgj@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
MINIO_IMAGE=${MINIO_FIXTURE_IMAGE}
AQUILA_BACKUP_MIN_FREE_PERCENT=0
CUSTOM_PROD_DBNAME=custom_restore_prod
EOF
cat > "${DEPLOY_DIR}/.env.prod.compose" <<'EOF'
DB_BASE_NAME=compose_blog
EOF

cat > "${WORK_DIR}/dump.sql" <<'SQL'
CREATE TABLE flyway_schema_history(success boolean);
CREATE TABLE post(id bigint, listed boolean, created_at timestamptz);
SQL
openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${KEY_FILE}" -in "${WORK_DIR}/dump.sql" -out "${POSTGRES_BACKUP_DIR}/dump.sql.enc"
cat > "${POSTGRES_BACKUP_DIR}/metadata.env" <<EOF
backup_set_id=20260101-010203
class=daily
created_at=20260101-010203
created_at_utc=2026-01-01T01:02:03Z
encryption=openssl-enc-aes-256-cbc-pbkdf2
encryption_key_file=${KEY_FILE}
EOF
"${REAL_DOCKER}" run -d \
  --name "${MINIO_SOURCE_CONTAINER}" \
  --network none \
  -e MINIO_ROOT_USER=restore-test \
  -e MINIO_ROOT_PASSWORD=restore_test_password \
  -v "${MINIO_SOURCE_DIR}:/data" \
  "${MINIO_FIXTURE_IMAGE}" server /data >/dev/null
for _ in {1..30}; do
  if "${REAL_DOCKER}" exec "${MINIO_SOURCE_CONTAINER}" mc ready local >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"${REAL_DOCKER}" exec "${MINIO_SOURCE_CONTAINER}" mc ready local >/dev/null
"${REAL_DOCKER}" exec "${MINIO_SOURCE_CONTAINER}" sh -c \
  'mc alias set fixture http://127.0.0.1:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null'
"${REAL_DOCKER}" exec "${MINIO_SOURCE_CONTAINER}" mc mb fixture/post-img >/dev/null
printf 'fixture-object\n' | "${REAL_DOCKER}" exec -i "${MINIO_SOURCE_CONTAINER}" mc pipe 'fixture/post-img/posts/2026/with space/sample.txt' >/dev/null
printf 'fixture-object-2\n' | "${REAL_DOCKER}" exec -i "${MINIO_SOURCE_CONTAINER}" mc pipe 'fixture/post-img/posts/2026/with space/zzz.txt' >/dev/null
"${REAL_DOCKER}" stop "${MINIO_SOURCE_CONTAINER}" >/dev/null
tar -C "${MINIO_SOURCE_DIR}" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${KEY_FILE}" -out "${MINIO_BACKUP_DIR}/minio-data.tar.gz.enc"
cp -a "${MINIO_SOURCE_DIR}/." "${WORK_DIR}/storage/minio/"
"${REAL_DOCKER}" rm -f -v "${MINIO_SOURCE_CONTAINER}" >/dev/null
"${REAL_DOCKER}" run -d \
  --name "${MINIO_LIVE_CONTAINER}" \
  --network none \
  -e MINIO_ROOT_USER=restore-test \
  -e MINIO_ROOT_PASSWORD=restore_test_password \
  -v "${WORK_DIR}/storage/minio:/data" \
  "${MINIO_FIXTURE_IMAGE}" server /data >/dev/null
for _ in {1..30}; do
  if "${REAL_DOCKER}" exec "${MINIO_LIVE_CONTAINER}" mc ready local >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"${REAL_DOCKER}" exec "${MINIO_LIVE_CONTAINER}" mc ready local >/dev/null

cat > "${FAKE_BIN_DIR}/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  compose)
    if [[ "$*" == *"exec -T db_1 psql"* && "$*" == *"SELECT member_id"* ]]; then
      if [[ -n "${FAKE_EXPECT_CURRENT_DB:-}" && "$*" != *"-d ${FAKE_EXPECT_CURRENT_DB}"* ]]; then
        echo "expected current database ${FAKE_EXPECT_CURRENT_DB}: $*" >&2
        exit 1
      fi
      echo "7"
      if [[ -n "${FAKE_PRIVACY_TOMBSTONE_COUNTER_FILE:-}" ]]; then
        count=0
        [[ -f "${FAKE_PRIVACY_TOMBSTONE_COUNTER_FILE}" ]] && read -r count < "${FAKE_PRIVACY_TOMBSTONE_COUNTER_FILE}"
        count=$((count + 1))
        printf '%s\n' "${count}" > "${FAKE_PRIVACY_TOMBSTONE_COUNTER_FILE}"
        if [[ "${FAKE_PRIVACY_UNSTABLE_TOMBSTONES:-0}" == "1" && "${count}" -gt 1 ]]; then
          echo "8"
        fi
      fi
      exit 0
    fi
    if [[ "$*" == *"exec -T minio_1 sh -c"* && "$*" == *"mc --json ls --recursive current"* ]]; then
      "${REAL_DOCKER}" exec "${MINIO_LIVE_CONTAINER}" sh -c \
        'config_dir="$(mktemp -d /tmp/aquila-restore-mc.XXXXXX)" || exit 1; trap '\''rm -rf -- "${config_dir}"'\'' EXIT; MC_CONFIG_DIR="${config_dir}" mc alias set current http://127.0.0.1:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null && MC_CONFIG_DIR="${config_dir}" mc --json ls --recursive current'
      if [[ "${FAKE_MINIO_LARGE_INVENTORY:-0}" == "1" ]]; then
        awk 'BEGIN { for (i = 1; i <= 20000; i++) printf "{\"status\":\"success\",\"type\":\"file\",\"key\":\"large/object-%05d\"}\n", i }'
      fi
      exit 0
    fi
    echo "unexpected docker compose command: $*" >&2
    exit 1
    ;;
  run)
    if [[ "$*" == *"minio/minio@sha256:"* ]]; then
      exec "${REAL_DOCKER}" "$@"
    fi
    echo "fake-postgres-container"
    ;;
  rm)
    if [[ "$*" == *"aquila-restore-drill-minio-"* ]]; then
      exec "${REAL_DOCKER}" "$@"
    fi
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
        echo "${FAKE_PRIVACY_MISSING_LATEST_TOMBSTONES:-0}"
        exit 0
      fi
      echo "unexpected docker exec -i command for ${container}: $*" >&2
      exit 1
    fi

    container="$1"
    shift
    if [[ "${container}" == aquila-restore-drill-minio-* && "${1:-}" == "curl" && "${FAKE_MINIO_NO_CURL:-0}" == "1" ]]; then
      exit 127
    fi
    if [[ "${container}" == aquila-restore-drill-minio-* ]]; then
      exec "${REAL_DOCKER}" exec "${container}" "$@"
    fi
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
          *"WITH latest(member_id)"*)
            echo "${FAKE_PRIVACY_MISSING_LATEST_TOMBSTONES:-0}"
            ;;
          *to_regclass*)
            echo "ready"
            ;;
          *"JOIN public.member m"*)
            echo "${FAKE_PRIVACY_MEMBER_VIOLATIONS:-0}"
            ;;
          *"JOIN public.member_session ms"*)
            echo "${FAKE_PRIVACY_ACTIVE_SESSIONS:-0}"
            ;;
          *"JOIN public.post p"*)
            echo "${FAKE_PRIVACY_UNDELETED_POSTS:-0}"
            ;;
          *"FROM public.member_account_deletion;"*)
            echo "1"
            ;;
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
cat > "${FAKE_BIN_DIR}/df" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_LOW_FREE_SPACE:-0}" == "1" ]]; then
  printf '%s\n' \
    'Filesystem 1024-blocks Used Available Capacity Mounted on' \
    '/dev/fake 100 80 20 80% /fixture'
  exit 0
fi
exec "${REAL_DF}" "$@"
SH
chmod +x "${FAKE_BIN_DIR}/df"
cat > "${FAKE_BIN_DIR}/sleep" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_FAST_SLEEP:-0}" == "1" ]]; then
  exec /bin/sleep 0.01
fi
exec /bin/sleep "$@"
SH
chmod +x "${FAKE_BIN_DIR}/sleep"
cat > "${UNSAFE_ARCHIVE_BIN_DIR}/tar" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_UNSAFE_ARCHIVE:-0}" == "1" && "${1:-}" == "-tzf" ]]; then
  exec awk 'BEGIN { print "../escape"; for (i = 1; i <= 200000; i++) print "safe/path-" i }'
fi
exec "${REAL_TAR}" "$@"
SH
chmod +x "${UNSAFE_ARCHIVE_BIN_DIR}/tar"

PATH="${FAKE_BIN_DIR}:${PATH}" \
REAL_DOCKER="${REAL_DOCKER}" \
REAL_DF="${REAL_DF}" \
MINIO_LIVE_CONTAINER="${MINIO_LIVE_CONTAINER}" \
FAKE_MINIO_LARGE_INVENTORY=1 \
FAKE_MINIO_NO_CURL=1 \
FAKE_FAST_SLEEP=1 \
FAKE_EXPECT_CURRENT_DB=custom_restore_prod \
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
require_pattern "${ARTIFACT_DIR}/restore-drill-result.env" 'post-img/posts/2026/with\\ space/sample.txt' "result.env must include sampled object key with a space"
require_pattern "${ARTIFACT_DIR}/restore-drill-summary.md" 'Backup Restore Drill Summary' "summary must be generated"
require_pattern "${ARTIFACT_DIR}/restore-drill-summary.md" 'Restore privacy gate: `pass`' "summary must include privacy gate status"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^status=pass$' "privacy gate evidence must pass"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^tombstone_count=1$' "privacy gate evidence must record tombstone count"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^member_anonymization_violations=0$' "privacy gate must verify member anonymization"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^active_session_violations=0$' "privacy gate must verify session revocation"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^undeleted_post_violations=0$' "privacy gate must verify deleted-member posts"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^latest_tombstone_count=1$' "privacy gate must record latest tombstone evidence"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^missing_latest_tombstone_violations=0$' "privacy gate must reject revived members"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^restored_deleted_object_violations=0$' "privacy gate must reject revived objects"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^minio_checksum=pass$' "privacy gate must verify MinIO checksum evidence"
require_pattern "${ARTIFACT_DIR}/restore-privacy-gate.txt" '^tombstone_replay=latest-state-compared$' "privacy gate evidence must name the verification mode"
grep -q 'post-img/posts/2026/with space/sample.txt' "${ARTIFACT_DIR}/minio-checksums.sha256"

if PATH="${UNSAFE_ARCHIVE_BIN_DIR}:${FAKE_BIN_DIR}:${PATH}" \
  REAL_TAR="${REAL_TAR}" \
  REAL_DOCKER="${REAL_DOCKER}" \
  REAL_DF="${REAL_DF}" \
  MINIO_LIVE_CONTAINER="${MINIO_LIVE_CONTAINER}" \
  FAKE_UNSAFE_ARCHIVE=1 \
  AQUILA_RESTORE_DRILL_BACKUP_SET_ID="${BACKUP_SET_ID}" \
  AQUILA_RESTORE_DRILL_DEPLOY_DIR="${DEPLOY_DIR}" \
  AQUILA_RESTORE_DRILL_ARTIFACT_DIR="${WORK_DIR}/unsafe-archive-artifacts" \
  AQUILA_RESTORE_DRILL_TIMESTAMP="20260105-030405" \
  AQUILA_RESTORE_DRILL_NOW_EPOCH="1767582245" \
    "${DRILL_SCRIPT}" > "${WORK_DIR}/unsafe-archive.txt" 2>&1; then
  echo "restore drill unexpectedly passed with an unsafe path in a large archive listing" >&2
  exit 1
fi
require_pattern "${WORK_DIR}/unsafe-archive.txt" 'MinIO backup archive contains an unsafe path' "restore drill must reject unsafe paths without a pipefail SIGPIPE bypass"

if PATH="${FAKE_BIN_DIR}:${PATH}" \
  REAL_DOCKER="${REAL_DOCKER}" \
  REAL_DF="${REAL_DF}" \
  MINIO_LIVE_CONTAINER="${MINIO_LIVE_CONTAINER}" \
  FAKE_LOW_FREE_SPACE=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=50 \
  AQUILA_RESTORE_DRILL_BACKUP_SET_ID="${BACKUP_SET_ID}" \
  AQUILA_RESTORE_DRILL_DEPLOY_DIR="${DEPLOY_DIR}" \
  AQUILA_RESTORE_DRILL_ARTIFACT_DIR="${WORK_DIR}/capacity-artifacts" \
  AQUILA_RESTORE_DRILL_TIMESTAMP="20260104-030405" \
  AQUILA_RESTORE_DRILL_NOW_EPOCH="1767495845" \
    "${DRILL_SCRIPT}" > "${WORK_DIR}/insufficient-extraction-capacity.txt" 2>&1; then
  echo "restore drill unexpectedly passed without extraction reserve" >&2
  exit 1
fi
require_pattern "${WORK_DIR}/insufficient-extraction-capacity.txt" 'MinIO archive extraction would violate backup free-space reserve' "restore drill must fail closed before extraction consumes the disk reserve"

if PATH="${FAKE_BIN_DIR}:${PATH}" \
  REAL_DOCKER="${REAL_DOCKER}" \
  REAL_DF="${REAL_DF}" \
  MINIO_LIVE_CONTAINER="${MINIO_LIVE_CONTAINER}" \
  FAKE_PRIVACY_UNSTABLE_TOMBSTONES=1 \
  FAKE_PRIVACY_TOMBSTONE_COUNTER_FILE="${WORK_DIR}/unstable-tombstone-counter.txt" \
  AQUILA_RESTORE_DRILL_BACKUP_SET_ID="${BACKUP_SET_ID}" \
  AQUILA_RESTORE_DRILL_DEPLOY_DIR="${DEPLOY_DIR}" \
  AQUILA_RESTORE_DRILL_ARTIFACT_DIR="${WORK_DIR}/unstable-artifacts" \
  AQUILA_RESTORE_DRILL_TIMESTAMP="20260103-030405" \
  AQUILA_RESTORE_DRILL_NOW_EPOCH="1767409445" \
    "${DRILL_SCRIPT}" > "${WORK_DIR}/unstable-latest-state.txt" 2>&1; then
  echo "restore drill unexpectedly passed with changing tombstones" >&2
  exit 1
fi
require_pattern "${WORK_DIR}/unstable-latest-state.txt" 'latest member tombstone evidence changed during privacy gate' "restore drill must fail closed when latest tombstones change"

docker run --detach \
  --name "${PRIVACY_DB_CONTAINER}" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  "${PRIVACY_DB_IMAGE}" >/dev/null

privacy_db_ready=false
for _ in {1..30}; do
  if docker exec "${PRIVACY_DB_CONTAINER}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    privacy_db_ready=true
    break
  fi
  sleep 1
done
[[ "${privacy_db_ready}" == "true" ]] || {
  echo "privacy fixture PostgreSQL did not become ready" >&2
  exit 1
}

privacy_psql() {
  docker exec "${PRIVACY_DB_CONTAINER}" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1" >/dev/null
}

run_privacy_gate() {
  BACKUP_SET_ID="${BACKUP_SET_ID}" \
  BACKUP_CLASS="daily" \
  POSTGRES_CONTAINER="${PRIVACY_DB_CONTAINER}" \
  POSTGRES_DB="postgres" \
  MINIO_CHECKSUM_FILE="${ARTIFACT_DIR}/minio-checksums.sha256" \
  MINIO_SAMPLE_OBJECT="${PRIVACY_SAMPLE_OBJECT:-post-img/posts/2026/with space/sample.txt}" \
  LATEST_MEMBER_TOMBSTONE_FILE="${WORK_DIR}/latest-member-tombstones.txt" \
  CURRENT_MINIO_OBJECT_KEY_FILE="${WORK_DIR}/current-minio-object-keys.txt" \
  RESTORED_MINIO_OBJECT_KEY_FILE="${WORK_DIR}/restored-minio-object-keys.txt" \
    "${PRIVACY_GATE_SCRIPT}"
}

expect_privacy_failure() {
  local scenario="$1"
  if run_privacy_gate > "${WORK_DIR}/privacy-gate-${scenario}.txt" 2>&1; then
    echo "privacy gate unexpectedly passed: ${scenario}" >&2
    exit 1
  fi
}

privacy_psql "
  CREATE SCHEMA postgres;
  CREATE TABLE public.member (
    id bigint PRIMARY KEY,
    deleted_at timestamptz,
    email text,
    password text,
    nickname text,
    login_id text
  );
  CREATE TABLE public.member_account_deletion (member_id bigint PRIMARY KEY);
  CREATE TABLE public.member_session (member_id bigint, revoked_at timestamptz);
  CREATE TABLE public.post (author_id bigint, deleted_at timestamptz);
  CREATE TABLE postgres.member (LIKE public.member INCLUDING ALL);
  CREATE TABLE postgres.member_account_deletion (LIKE public.member_account_deletion INCLUDING ALL);
  CREATE TABLE postgres.member_session (LIKE public.member_session INCLUDING ALL);
  CREATE TABLE postgres.post (LIKE public.post INCLUDING ALL);
  INSERT INTO public.member VALUES (7, now(), NULL, NULL, '탈퇴한 사용자', 'deleted-7-fixture');
  INSERT INTO public.member_account_deletion VALUES (7);
  INSERT INTO postgres.member SELECT * FROM public.member;
  INSERT INTO postgres.member_account_deletion SELECT * FROM public.member_account_deletion;
"

printf '7\n' > "${WORK_DIR}/latest-member-tombstones.txt"
printf '%s\n' 'post-img/posts/2026/with space/sample.txt' > "${WORK_DIR}/current-minio-object-keys.txt"
printf '%s\n' 'post-img/posts/2026/with space/sample.txt' > "${WORK_DIR}/restored-minio-object-keys.txt"

run_privacy_gate > "${WORK_DIR}/privacy-gate-pass.txt"
require_pattern "${WORK_DIR}/privacy-gate-pass.txt" '^status=pass$' "real PostgreSQL privacy fixture must pass"

cp "${ARTIFACT_DIR}/minio-checksums.sha256" "${WORK_DIR}/minio-checksums.original.sha256"
TRAILING_SPACE_SAMPLE_OBJECT='post-img/posts/2026/trailing-space.txt '
printf '%064d  %s\n' 0 "${TRAILING_SPACE_SAMPLE_OBJECT}" > "${ARTIFACT_DIR}/minio-checksums.sha256"
if ! PRIVACY_SAMPLE_OBJECT="${TRAILING_SPACE_SAMPLE_OBJECT}" run_privacy_gate > "${WORK_DIR}/privacy-gate-trailing-space-key.txt" 2>&1; then
  echo "privacy gate rejected a checksum key with a trailing space" >&2
  cat "${WORK_DIR}/privacy-gate-trailing-space-key.txt" >&2
  exit 1
fi
cp "${WORK_DIR}/minio-checksums.original.sha256" "${ARTIFACT_DIR}/minio-checksums.sha256"

printf '8\n' > "${WORK_DIR}/latest-member-tombstones.txt"
expect_privacy_failure "missing-latest-tombstone"
printf '7\n' > "${WORK_DIR}/latest-member-tombstones.txt"

: > "${WORK_DIR}/current-minio-object-keys.txt"
expect_privacy_failure "restored-deleted-object"
printf '%s\n' 'post-img/posts/2026/with space/sample.txt' > "${WORK_DIR}/current-minio-object-keys.txt"

privacy_psql "UPDATE public.member SET nickname = NULL, login_id = NULL WHERE id = 7;"
expect_privacy_failure "null-anonymization"

privacy_psql "
  UPDATE public.member SET nickname = '탈퇴한 사용자', login_id = 'deleted-7-fixture' WHERE id = 7;
  INSERT INTO public.member_session VALUES (7, NULL);
"
expect_privacy_failure "active-session"

privacy_psql "
  TRUNCATE public.member_session;
  INSERT INTO public.post VALUES (7, NULL);
"
expect_privacy_failure "undeleted-post"

privacy_psql "
  TRUNCATE public.post;
  INSERT INTO public.member_account_deletion
  SELECT id FROM generate_series(8, 25000) AS ids(id);
"
seq 7 25000 > "${WORK_DIR}/latest-member-tombstones.txt"
run_privacy_gate > "${WORK_DIR}/privacy-gate-large-tombstone-list.txt"
require_pattern "${WORK_DIR}/privacy-gate-large-tombstone-list.txt" '^latest_tombstone_count=24994$' "privacy gate must stream a tombstone list larger than one argv"

echo "[external-backup-restore-drill] ok"
