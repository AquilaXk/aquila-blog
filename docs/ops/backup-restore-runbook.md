# Backup Restore Runbook

Use this procedure for backup restore drills, disaster recovery, and restored-service
validation.

## Restore controls

1. Keep the restore target isolated from production traffic.
2. Record the backup set, source time, restore target, operator, and start time.
3. Use encrypted PostgreSQL and object-storage artifacts only, with the encryption key
   stored outside the backup root.
4. Do not copy secret-bearing environment files into deploy backup artifacts. Retain
   only non-secret deployment configuration, active-slot and image metadata, and the
   `secret_files_copied=false` manifest evidence.
5. Verify restored database and object artifacts, checksums, schema history, and the
   expected public-service data before considering traffic open.
6. Run the configured `AQUILA_RESTORE_PRIVACY_GATE_SCRIPT` and require its
   `status=pass` evidence before traffic can open.
7. Invalidate restored sessions, credentials, cookies, API keys, and other access
   material before the environment can serve traffic.
8. Keep traffic closed until the restore validation records `status=pass` evidence and
   the service owner approves reopening it.

## Encryption and artifacts

- PostgreSQL artifact: `postgres/<class>/<backup_set_id>/dump.sql.enc`.
- Object-storage artifact: `minio/<class>/<backup_set_id>/minio-data.tar.gz.enc`.
- Encryption uses `openssl enc -aes-256-cbc -pbkdf2 -salt`; decrypt failures and
  metadata mismatches fail closed. This mode is not authenticated encryption, so the
  restore gate must keep integrity and metadata mismatches fail closed until it is
  replaced by an authenticated format.
- Keep the active encryption key outside `AQUILA_BACKUP_ROOT`; rotate keys through a
  separately recorded operations change and retain old keys only for the restore window.

## Evidence and exit criteria

Record the workflow link, artifact checksums, backup set id, restore timing, RPO/RTO,
key separation result, validation result, and traffic-open approval. Do not reopen
traffic when any validation, isolation, secret-exclusion, or credential-invalidation
check is incomplete.
