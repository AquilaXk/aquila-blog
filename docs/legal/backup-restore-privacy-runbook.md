# Backup Restore Privacy Runbook

운영 backup 복원, restore drill, disaster recovery 중 삭제된 개인정보가 되살아나거나 정책과 다른 상태로 노출되지 않도록 확인하는 절차다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Infrastructure owner | Home server backup/restore 담당 |
| Privacy owner | Privacy request owner |
| Service owner | Traffic open 승인자 |
| Legal counsel | 법적 보존/삭제 충돌 검토 필요 시 |

## Trigger

- `Backup Restore Drill` workflow 수동 실행
- 운영 DB 또는 object storage restore
- incident containment 후 clean backup 검증
- 계정 삭제 tombstone 또는 retention job 변경 후 restore 재검증

## Restore Privacy Gate

1. restore target이 production traffic과 격리되어 있는지 확인한다.
2. backup set id, backup class, source time, restore target, operator를 기록한다.
3. `AQUILA_BACKUP_ENCRYPTION_KEY_FILE`이 backup root 밖의 운영 key 파일을 가리키는지 확인한다.
4. PostgreSQL `dump.sql.enc`와 MinIO `minio-data.tar.gz.enc`만 복호화 restore 대상으로 사용한다.
5. restore 전 최신 deletion tombstone과 retention cutoff를 준비한다.
6. PostgreSQL restore 후 `AQUILA_RESTORE_PRIVACY_GATE_SCRIPT`가 tombstone replay 또는 동등한 삭제 검증을 실행하고 `status=pass` evidence를 남긴다.
7. object storage restore 후 tombstone object key hash list가 재노출되지 않는지 확인한다.
8. session, refresh token, signup token, OAuth pending token, auth cookie, API key가 restore 후 재사용 가능하지 않은지 확인한다.
9. public edge probe와 live E2E는 `restore-privacy-gate.txt`가 pass evidence를 남기기 전에는 production traffic에 연결하지 않는다.

## Backup Encryption

- PostgreSQL backup artifact: `postgres/<class>/<backup_set_id>/dump.sql.enc`.
- MinIO backup artifact: `minio/<class>/<backup_set_id>/minio-data.tar.gz.enc`.
- Algorithm: `openssl enc -aes-256-cbc -pbkdf2 -salt`.
- Key file: `AQUILA_BACKUP_ENCRYPTION_KEY_FILE`로 지정하며 `AQUILA_BACKUP_ROOT` 내부에 둘 수 없다.
  값을 생략하면 `${AQUILA_EXTERNAL_STORAGE_ROOT}/backup-encryption.key`를 사용하고, 최초 backup 시 0600 권한으로 생성된다.
- Rotation: 새 key 파일을 배포 env에 먼저 추가하고 다음 backup부터 새 key로 생성한다. 기존 backup 복구 기간 동안 이전 key는 별도 offline secret store에 보관하고, retention 만료 후 폐기한다.
- 접근 log: key 파일 read 권한은 backup/restore 운영자와 restore drill workflow 실행 계정으로 제한하고, key 접근/rotation/drill 실행 시각을 운영 변경 기록에 남긴다.

## Tombstone Replay Checklist

| 대상 | 확인 |
| --- | --- |
| member row | deleted/anonymized 상태 유지 |
| legal acceptance | 법적 보존 필요 metadata만 보존 |
| privacy request | request audit record 유지 |
| post/comment | 삭제 또는 anonymized 상태 유지 |
| object storage | 삭제 대상 key 재생성 없음 |
| cache/index | restored stale cache purge |
| auth asset | active session, refresh token, API key 재활성화 없음 |

## Evidence

- workflow run link와 artifact: `restore-drill-summary.md`, `restore-drill-result.env`, checksum file.
- backup set id, restore startedAt/completedAt, RPO/RTO.
- encryption algorithm과 key file 분리 확인 결과.
- tombstone replay result: count, skipped with reason, failure list.
- `restore-privacy-gate.txt`: tombstone replay 또는 동등한 삭제 검증 pass evidence.
- object checksum result와 redacted sample.
- traffic open approval: approver, timestamp, gate result.

## Exit Criteria

- tombstone replay 또는 동등한 deletion verification이 pass다.
- 개인정보 삭제/처리정지 요청이 restore로 되돌아가지 않았다.
- token/session/API key/refresh token/signup token/OAuth pending token이 재활성화되지 않았다.
- service owner가 traffic open을 승인했다.
- 실패 항목은 production 연결 전에 issue/PR로 분리됐다.

## Validation

- `Backup Restore Drill` workflow를 실행하고 artifact를 확인한다.
- 삭제된 테스트 계정 tombstone을 포함한 fixture로 restore privacy gate를 검증한다.
- RPO/RTO 결과와 privacy deletion result를 launch gate evidence에 연결한다.
