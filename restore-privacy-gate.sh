#!/usr/bin/env bash
set -euo pipefail

exec </dev/null
umask 077

fail() {
  printf '[restore-privacy-gate] %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "${name} is required"
}

psql_scalar() {
  local sql="$1"
  local value
  value="$(
    docker exec "${POSTGRES_CONTAINER}" \
      psql -U postgres -d "${POSTGRES_DB}" -At -v ON_ERROR_STOP=1 -c "${sql}" \
      | tr -d '\r' \
      | head -n 1
  )" || fail "restored PostgreSQL invariant query failed"
  [[ -n "${value}" ]] || fail "restored PostgreSQL invariant query returned no value"
  printf '%s' "${value}"
}

missing_latest_tombstone_count() {
  local value
  value="$({
    printf '%s\n' \
      'CREATE TEMP TABLE latest_tombstones (member_id bigint PRIMARY KEY) ON COMMIT PRESERVE ROWS;' \
      '\copy latest_tombstones (member_id) FROM STDIN'
    cat "${LATEST_MEMBER_TOMBSTONE_FILE}"
    printf '%s\n' \
      '\.' \
      'SELECT COUNT(*) FROM latest_tombstones l LEFT JOIN public.member_account_deletion mad ON mad.member_id = l.member_id WHERE mad.member_id IS NULL;'
  } | docker exec -i "${POSTGRES_CONTAINER}" \
    psql -U postgres -d "${POSTGRES_DB}" -qAt -v ON_ERROR_STOP=1 \
    | tr -d '\r' \
    | tail -n 1)" || fail "latest member tombstone comparison failed"
  [[ -n "${value}" ]] || fail "latest member tombstone comparison returned no value"
  printf '%s' "${value}"
}

require_env BACKUP_SET_ID
require_env BACKUP_CLASS
require_env POSTGRES_CONTAINER
require_env POSTGRES_DB
require_env MINIO_CHECKSUM_FILE
require_env MINIO_SAMPLE_OBJECT
require_env LATEST_MEMBER_TOMBSTONE_FILE
require_env CURRENT_MINIO_OBJECT_KEY_FILE
require_env RESTORED_MINIO_OBJECT_KEY_FILE

[[ "${BACKUP_SET_ID}" =~ ^[0-9]{8}-[0-9]{6}$ ]] || fail "unsafe BACKUP_SET_ID"
case "${BACKUP_CLASS}" in
  daily|weekly|monthly) ;;
  *) fail "unsafe BACKUP_CLASS" ;;
esac
case "${POSTGRES_CONTAINER}" in
  aquila-restore-drill-*) ;;
  *) fail "unsafe POSTGRES_CONTAINER" ;;
esac
[[ "${POSTGRES_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail "unsafe POSTGRES_DB"
[[ "${MINIO_SAMPLE_OBJECT}" != /* && "${MINIO_SAMPLE_OBJECT}" != *$'\n'* && "${MINIO_SAMPLE_OBJECT}" != *$'\r'* ]] \
  || fail "unsafe MINIO_SAMPLE_OBJECT"
[[ -s "${MINIO_CHECKSUM_FILE}" ]] || fail "MINIO_CHECKSUM_FILE is missing or empty"

IFS= read -r minio_checksum_line < "${MINIO_CHECKSUM_FILE}" \
  || fail "could not read MINIO_CHECKSUM_FILE"
[[ "${minio_checksum_line:64:2}" == "  " ]] || fail "invalid MinIO checksum evidence delimiter"
minio_checksum="${minio_checksum_line:0:64}"
minio_object="${minio_checksum_line:66}"
[[ "${minio_checksum}" =~ ^[0-9a-f]{64}$ ]] || fail "invalid MinIO SHA-256 evidence"
[[ "${minio_object}" == "${MINIO_SAMPLE_OBJECT}" ]] || fail "MinIO checksum object does not match selected sample"

[[ -f "${LATEST_MEMBER_TOMBSTONE_FILE}" ]] || fail "latest member tombstone evidence is missing"
[[ -f "${CURRENT_MINIO_OBJECT_KEY_FILE}" ]] || fail "current MinIO object key evidence is missing"
[[ -s "${RESTORED_MINIO_OBJECT_KEY_FILE}" ]] || fail "restored MinIO object key evidence is missing or empty"

for key_file in "${CURRENT_MINIO_OBJECT_KEY_FILE}" "${RESTORED_MINIO_OBJECT_KEY_FILE}"; do
  if grep -Eq '^$' "${key_file}"; then
    fail "MinIO object key evidence contains an empty key"
  fi
  sort -c -u "${key_file}" >/dev/null 2>&1 || fail "MinIO object key evidence must be sorted and unique"
done

restored_deleted_object_violations="$(comm -23 "${RESTORED_MINIO_OBJECT_KEY_FILE}" "${CURRENT_MINIO_OBJECT_KEY_FILE}" | wc -l | tr -d ' ')"

latest_tombstone_count=0
while IFS= read -r member_id || [[ -n "${member_id}" ]]; do
  [[ "${member_id}" =~ ^[1-9][0-9]*$ ]] || fail "latest member tombstone evidence contains an invalid identifier"
  latest_tombstone_count=$((latest_tombstone_count + 1))
done < "${LATEST_MEMBER_TOMBSTONE_FILE}"
sort -n -c -u "${LATEST_MEMBER_TOMBSTONE_FILE}" >/dev/null 2>&1 \
  || fail "latest member tombstone evidence must be sorted and unique"

schema_status="$(psql_scalar "
  SELECT CASE
    WHEN to_regclass('public.member_account_deletion') IS NOT NULL
     AND to_regclass('public.member') IS NOT NULL
     AND to_regclass('public.member_session') IS NOT NULL
     AND to_regclass('public.post') IS NOT NULL
    THEN 'ready'
    ELSE 'missing'
  END;
")"
[[ "${schema_status}" == "ready" ]] || fail "required privacy schema is missing from restored backup"

tombstone_count="$(psql_scalar "SELECT COUNT(*) FROM public.member_account_deletion;")"
missing_latest_tombstone_violations="0"
if [[ "${latest_tombstone_count}" -gt 0 ]]; then
  missing_latest_tombstone_violations="$(missing_latest_tombstone_count)"
fi
member_anonymization_violations="$(psql_scalar "
  SELECT COUNT(*)
  FROM public.member_account_deletion mad
  JOIN public.member m ON m.id = mad.member_id
  WHERE m.deleted_at IS NULL
     OR m.email IS NOT NULL
     OR m.password IS NOT NULL
     OR m.nickname IS DISTINCT FROM '탈퇴한 사용자'
     OR m.login_id IS NULL
     OR m.login_id NOT LIKE ('deleted-' || m.id::text || '-%');
")"
active_session_violations="$(psql_scalar "
  SELECT COUNT(*)
  FROM public.member_account_deletion mad
  JOIN public.member_session ms ON ms.member_id = mad.member_id
  WHERE ms.revoked_at IS NULL;
")"
undeleted_post_violations="$(psql_scalar "
  SELECT COUNT(*)
  FROM public.member_account_deletion mad
  JOIN public.post p ON p.author_id = mad.member_id
  WHERE p.deleted_at IS NULL;
")"

for count in \
  "${tombstone_count}" \
  "${latest_tombstone_count}" \
  "${missing_latest_tombstone_violations}" \
  "${member_anonymization_violations}" \
  "${active_session_violations}" \
  "${undeleted_post_violations}" \
  "${restored_deleted_object_violations}"; do
  [[ "${count}" =~ ^[0-9]+$ ]] || fail "privacy invariant query returned a non-numeric count"
done

[[ "${member_anonymization_violations}" == "0" ]] \
  || fail "deleted-member anonymization violations=${member_anonymization_violations}"
[[ "${missing_latest_tombstone_violations}" == "0" ]] \
  || fail "missing latest member tombstone violations=${missing_latest_tombstone_violations}"
[[ "${active_session_violations}" == "0" ]] \
  || fail "active deleted-member session violations=${active_session_violations}"
[[ "${undeleted_post_violations}" == "0" ]] \
  || fail "undeleted deleted-member post violations=${undeleted_post_violations}"
[[ "${restored_deleted_object_violations}" == "0" ]] \
  || fail "restored deleted MinIO object violations=${restored_deleted_object_violations}"

printf 'status=pass\n'
printf 'backup_set_id=%s\n' "${BACKUP_SET_ID}"
printf 'backup_class=%s\n' "${BACKUP_CLASS}"
printf 'tombstone_replay=latest-state-compared\n'
printf 'tombstone_count=%s\n' "${tombstone_count}"
printf 'latest_tombstone_count=%s\n' "${latest_tombstone_count}"
printf 'missing_latest_tombstone_violations=%s\n' "${missing_latest_tombstone_violations}"
printf 'member_anonymization_violations=%s\n' "${member_anonymization_violations}"
printf 'active_session_violations=%s\n' "${active_session_violations}"
printf 'undeleted_post_violations=%s\n' "${undeleted_post_violations}"
printf 'restored_deleted_object_violations=%s\n' "${restored_deleted_object_violations}"
printf 'minio_checksum=pass\n'
printf 'traffic_open=blocked_until_gate_pass\n'
