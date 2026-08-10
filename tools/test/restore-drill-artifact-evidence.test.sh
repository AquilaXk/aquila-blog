#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
verifier="${root_dir}/tools/test/verify-external-backup-restore-drill.sh"

if ! grep -q -- '--evidence-dir' "${verifier}"; then
  echo "missing --evidence-dir mode" >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/restore-drill-evidence.XXXXXX")"
artifact_dir="${work_dir}/artifacts"
hash="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
trap 'rm -rf "${work_dir}"' EXIT

write_valid_fixture() {
  rm -rf "${artifact_dir}"
  mkdir -p "${artifact_dir}"
  cat > "${artifact_dir}/restore-drill-result.env" <<EOF
STATUS=success
BACKUP_SET_ID=20260101-010203
BACKUP_CLASS=daily
RPO_TARGET_MINUTES=1440
RPO_ACTUAL_MINUTES=12
RTO_TARGET_MINUTES=120
RTO_ACTUAL_SECONDS=42
FLYWAY_SUCCESS_COUNT=32
POST_ROW_COUNT=7
LATEST_PUBLIC_POST_ID=42
MINIO_SAMPLE_SHA256=${hash}
ENCRYPTION=openssl-enc-aes-256-cbc-pbkdf2
RESTORE_PRIVACY_GATE=pass
EOF
  cat > "${artifact_dir}/restore-privacy-gate.txt" <<'EOF'
status=pass
backup_set_id=20260101-010203
backup_class=daily
tombstone_replay=latest-state-compared
tombstone_count=1
latest_tombstone_count=1
missing_latest_tombstone_violations=0
member_anonymization_violations=0
active_session_violations=0
undeleted_post_violations=0
restored_deleted_object_violations=0
minio_checksum=pass
traffic_open=blocked_until_gate_pass
EOF
  printf '%s  post-img/posts/2026/sample.txt\n' "${hash}" > "${artifact_dir}/minio-checksums.sha256"
  cat > "${artifact_dir}/restore-drill-summary.md" <<EOF
# Backup Restore Drill Summary

- Status: \`success\`
- Backup set: \`daily/20260101-010203\`
- RPO target: \`1440 minutes\`
- RPO actual: \`12 minutes\`
- RTO target: \`120 minutes\`
- RTO actual: \`42 seconds\`
- Flyway successful migrations: \`32\`
- Restored post rows: \`7\`
- Latest public post id: \`42\`
- MinIO sample sha256: \`${hash}\`
- Restore privacy gate: \`pass\`
EOF
}

expect_fail() {
  local name="$1"
  if "${verifier}" --evidence-dir "${artifact_dir}" >"${work_dir}/${name}.out" 2>&1; then
    echo "expected evidence verifier failure: ${name}" >&2
    exit 1
  fi
}

write_valid_fixture
"${verifier}" --evidence-dir "${artifact_dir}" >/dev/null

printf 'unexpected\n' > "${artifact_dir}/extra.txt"
expect_fail extra-regular-file
write_valid_fixture
mkdir -p "${artifact_dir}/nested"
printf 'unexpected\n' > "${artifact_dir}/nested/extra.txt"
expect_fail nested-file
write_valid_fixture
ln -s "${work_dir}/summary" "${artifact_dir}/extra-link"
expect_fail extra-symlink

rm "${artifact_dir}/restore-drill-summary.md"
expect_fail missing-file
write_valid_fixture
mv "${artifact_dir}/restore-drill-summary.md" "${work_dir}/summary"
ln -s "${work_dir}/summary" "${artifact_dir}/restore-drill-summary.md"
expect_fail symlink
write_valid_fixture
sed -i.bak 's/^STATUS=success$/STATUS=fail/' "${artifact_dir}/restore-drill-result.env"
rm "${artifact_dir}/restore-drill-result.env.bak"
expect_fail status-fail
write_valid_fixture
printf 'STATUS=success\n' >> "${artifact_dir}/restore-drill-result.env"
expect_fail duplicate-key
write_valid_fixture
sed -i.bak 's/^RPO_ACTUAL_MINUTES=12$/RPO_ACTUAL_MINUTES=-1/' "${artifact_dir}/restore-drill-result.env"
rm "${artifact_dir}/restore-drill-result.env.bak"
expect_fail negative-numeric
write_valid_fixture
sed -i.bak 's/^status=pass$/status=fail/' "${artifact_dir}/restore-privacy-gate.txt"
rm "${artifact_dir}/restore-privacy-gate.txt.bak"
expect_fail privacy-fail
write_valid_fixture
sed -i.bak 's/member_anonymization_violations=0/member_anonymization_violations=1/' "${artifact_dir}/restore-privacy-gate.txt"
rm "${artifact_dir}/restore-privacy-gate.txt.bak"
expect_fail privacy-violation
write_valid_fixture
grep -v '^traffic_open=' "${artifact_dir}/restore-privacy-gate.txt" > "${work_dir}/privacy-missing"
mv "${work_dir}/privacy-missing" "${artifact_dir}/restore-privacy-gate.txt"
expect_fail privacy-key-missing
write_valid_fixture
printf 'tombstone_count=1\n' >> "${artifact_dir}/restore-privacy-gate.txt"
expect_fail privacy-key-duplicate
write_valid_fixture
sed -i.bak 's/^0123456789abcdef/ffffffffffffffff/' "${artifact_dir}/minio-checksums.sha256"
rm "${artifact_dir}/minio-checksums.sha256.bak"
expect_fail checksum-mismatch
write_valid_fixture
printf 'SECRET=leak\n' >> "${artifact_dir}/restore-drill-summary.md"
expect_fail secret-marker
write_valid_fixture
printf 'DB_PASSWORD=leak\n' >> "${artifact_dir}/restore-drill-summary.md"
expect_fail secret-suffix-marker
write_valid_fixture
printf '%s\n' '-----BEGIN OPENSSH PRIVATE KEY-----' >> "${artifact_dir}/restore-drill-summary.md"
expect_fail pem-marker

echo "restore drill artifact evidence contract: PASS"
