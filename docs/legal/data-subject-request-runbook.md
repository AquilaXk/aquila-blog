# Data Subject Request Runbook

정보주체의 열람, 정정, 삭제, 처리정지, 동의 철회, export 요청을 처리하는 절차다. 외부 법정 기한과 거절 사유는 legal counsel 확인이 필요하다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Intake owner | `privacy@aquila-blog.example` 공유 메일함 담당 |
| Privacy request owner | Service owner |
| Technical owner | member/privacy API 담당 |
| Legal counsel | 출시 전 지정 필요 |

## Trigger

- `/settings/privacy` 또는 이메일로 개인정보 열람, 정정, 삭제, 처리정지, 동의 철회, export 요청 접수
- 계정 삭제 flow 실패 또는 legacy user 재동의 거부 후 export/delete 안내
- processor 또는 backup restore 과정에서 사용자 데이터 확인 요청 발생

## Intake And Identity Check

1. 요청 id를 만든다: `privacy-request-YYYYMMDD-NN`.
2. 요청 유형을 `access`, `correction`, `deletion`, `restriction`, `withdrawal`, `export` 중 하나로 분류한다.
3. 로그인 상태 요청도 access, export, deletion, restriction, withdrawal 같은 고위험 작업이면 재인증 또는 step-up verification을 진행한다.
4. 재인증이 끝난 로그인 요청은 session member id와 요청 id를 연결한다.
5. 이메일 요청은 계정 소유 증명 절차를 진행한다. password, token, 원본 cookie, 전체 log를 이메일로 요구하지 않는다.
6. 미확인 요청은 `identity_pending` 상태로 두고 처리 기한과 추가 확인 필요 항목을 기록한다.

## Handling Matrix

| 요청 | 처리 절차 | 거절 또는 제한 사유 |
| --- | --- | --- |
| 열람 | account, legal acceptance, privacy request, 공개 content, session summary를 export snapshot으로 제공 | 다른 사용자의 정보 포함, 보안상 session secret 원문 포함 요청 |
| 정정 | 사용자가 직접 수정 가능한 profile/content 경로 안내, 직접 수정 불가 데이터는 운영 변경 기록 작성 | 감사/보안 로그처럼 정정 대신 보존 사유가 있는 데이터 |
| 삭제 | `docs/legal/account-deletion-runbook.md`를 따른다 | 법적 보존, 분쟁 대응, 보안 abuse 조사 기간 |
| 처리정지 | optional tracking, Gemini, analytics, marketing-like processing을 중단하거나 비활성 상태 확인 | 서비스 제공에 필수인 인증/session 처리 |
| 동의 철회 | optional consent를 철회하고 향후 processing 중단 | 필수 약관/개인정보 처리 동의 철회는 계정 제한 또는 삭제 안내 |
| export | machine-readable snapshot 생성, 민감 token 원문 제외 | 본인확인 실패, 타인 정보 포함 |

## Evidence

- 요청 id, 접수 시각, requester channel, identity verification status.
- 처리 유형, owner, due date, decision, user response sent at.
- export/delete 결과는 원문 대신 file hash, row count, redaction note만 남긴다.
- 이메일 원문이나 신분증 사본은 repository에 커밋하지 않는다.

## Exit Criteria

- 사용자에게 처리 결과 또는 제한 사유가 전달됐다.
- 내부 기록에 요청 id, 처리자, 처리 시각, evidence 위치가 남았다.
- 삭제나 export가 실행된 경우 관련 API/workflow output과 redacted summary가 남았다.
- 처리 불가 또는 법무 검토 필요 건은 follow-up owner와 due date가 있다.

## Validation

- 테스트 계정으로 export 요청을 만들고 snapshot에 최신 legal acceptance metadata가 포함되는지 확인한다.
- 삭제 요청 dry run은 실제 운영 계정이 아닌 테스트 계정에서만 수행한다.
- 처리 기록에는 개인정보 원문 대신 redacted sample과 row count만 포함되는지 확인한다.
