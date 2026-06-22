# Account Deletion Runbook

사용자 계정 삭제 요청, 재동의 거부 후 삭제 요청, 운영자 privacy deletion 처리에 사용하는 절차다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Request owner | Privacy request owner |
| Technical owner | member/privacy, post/comment, storage 담당 |
| Infrastructure owner | backup/restore 담당 |
| Legal counsel | 보존 예외 판단 필요 시 |

## Trigger

- `/settings/privacy` 계정 삭제 요청
- 이메일로 접수된 삭제 요청이 본인확인 완료됨
- 재동의 거부 사용자가 계정 삭제를 요청함
- 침해사고 containment 후 특정 계정의 token/session/object 정리가 필요함

## Deletion Steps

1. 요청 id와 member id를 연결하고 본인확인 상태를 확인한다.
2. 삭제 전 export 요청 여부와 법적 보존/분쟁/abuse hold 여부를 확인한다.
3. active session, refresh token, API key, signup/session cookie를 revoke한다.
4. member profile, email, nickname, OAuth link, legal acceptance metadata, privacy request metadata를 retention policy에 맞춰 soft delete, anonymize, 또는 보존 상태로 분류한다.
5. posts/comments/profile content는 사용자 요청, 공개 게시 상태, 법적 보존 필요 여부에 따라 삭제 또는 anonymize한다.
6. object storage 파일과 derived cache를 삭제 queue에 넣고 result를 기록한다.
7. backup tombstone을 남겨 restore 후 삭제 상태가 되살아나지 않도록 한다.
8. cache, search index, public feed, sitemap, CDN을 revalidate 또는 purge한다.

## Backup Tombstone

- tombstone key: `account-deletion:<memberId>:<requestId>`.
- 포함 항목: member id, deletedAt, request id, deletion scope, object key hash list, legal hold 여부.
- 포함 금지: email 원문, token 원문, object 원본 URL secret.
- restore 후 traffic open 전에 tombstone replay 결과를 확인한다.

## Evidence

| Evidence | 내용 |
| --- | --- |
| deletion request record | request id, member id, verifiedAt, owner |
| session revoke proof | revoked session count, command/API result |
| row/object summary | deleted/anonymized/skipped row count, object key hash count |
| tombstone proof | tombstone id, createdAt, replay status |
| user response | 완료 또는 제한 사유 전달 시각 |

## Exit Criteria

- 사용자에게 완료 또는 제한 사유가 전달됐다.
- active login/session이 더 이상 유효하지 않다.
- public content/cache가 삭제 또는 anonymized 상태로 보인다.
- backup tombstone이 생성되고 restore drill에서 replay 대상에 포함된다.
- 법적 보존 예외가 있으면 owner, reason, review date가 있다.

## Validation

- 테스트 계정 삭제 요청으로 API 또는 운영 절차 dry run을 수행한다.
- restore drill 후 삭제된 테스트 계정이 재노출되지 않는지 확인한다.
- export/delete 안내는 `docs/legal/data-subject-request-runbook.md`와 충돌하지 않아야 한다.
