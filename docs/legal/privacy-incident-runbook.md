# Privacy Incident Runbook

개인정보 침해 의심 상황을 감지했을 때 사용하는 운영 절차다. 이 문서는 법률 자문이 아니며, 신고·통지 의무와 기한은 service owner가 legal counsel과 함께 최종 판단한다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Service owner | AquilaXk |
| Privacy contact | `privacy@aquila-blog.example` |
| Security owner | Service owner가 지정한 incident lead |
| Infrastructure owner | Home server / GitHub Actions / Vercel / Cloudflare 운영 담당 |
| Legal counsel | 출시 전 지정 필요 |

## Trigger

- 인증 token, email, IP, user agent, OAuth subject, 게시글 비공개 데이터, backup, log, analytics payload가 허가 없이 노출된 정황
- GitHub Actions artifact, server log, browser console, backup restore 결과, vendor dashboard에서 개인정보 과다 수집 또는 외부 전송 의심
- 사용자 또는 외부 제보로 개인정보 오처리, 삭제 실패, export 오발송, 계정 접근 이상이 접수됨

## Triage

1. incident lead를 1명 지정하고 incident id를 만든다: `privacy-incident-YYYYMMDD-NN`.
2. 새 쓰기 작업, 관련 배포, backup restore, vendor 설정 변경을 중단한다.
3. 의심 데이터 유형, 최초 감지 시각, 관련 user id 범위, 시스템 범위, 외부 processor 관련 여부를 기록한다.
4. 실제 개인정보 원문은 issue, PR, chat, repository에 쓰지 않는다. 민감 증거는 로컬 encrypted storage 또는 제한된 incident vault에 보관하고 evidence log에는 위치와 hash만 남긴다.
5. false positive일 가능성이 있어도 1차 containment 전에는 로그를 삭제하지 않는다.

## Containment

| 상황 | 즉시 조치 |
| --- | --- |
| token/session 노출 | 관련 session revoke, cookie/token rotation, auth log 보존 |
| 공개 페이지 노출 | page 또는 route disable, cache purge, Vercel/Cloudflare invalidation |
| GitHub artifact 노출 | artifact 다운로드 중단, retention 축소, secret rotation 검토 |
| vendor 전송 의심 | optional tracking/Gemini/vendor integration disable, processor contact |
| backup/restore 오복원 | traffic open 중단, tombstone replay, restore target 격리 |

## Impact Assessment

- 영향 데이터: email, nickname, OAuth subject hash, legal acceptance metadata, post/comment/profile content, token/session, backup object, log identifier.
- 영향 주체: signup applicant, registered member, public visitor, admin.
- 노출 경로: app response, log, artifact, external processor, backup restore, public cache.
- 범위 산정: affected member count, affected record count, first/last exposure time, external access 가능성.
- 법무 판단 분리: 신고·통지 대상, 기한, 문구, 관계 기관은 legal counsel 확인 후 결정한다.

## Notification And Reporting

1. service owner가 법무 확인 필요 여부를 `required`, `not required`, `unknown` 중 하나로 기록한다.
2. 사용자 통지가 필요하면 영향 범위, 발생 시각, 조치 현황, 사용자가 할 수 있는 조치, 문의처를 포함한다.
3. 관계 기관 신고가 필요하면 신고 전 증거 보존 상태와 containment 완료 여부를 확인한다.
4. 사용자 통지 문안과 신고 문안은 repository에 원문 개인정보 없이 보관한다.

## Evidence

| Evidence | 저장 위치 |
| --- | --- |
| incident timeline | incident vault 또는 제한된 운영 문서 |
| affected record query | query text는 commit 가능, 결과 원본은 commit 금지 |
| log sample | redacted sample만 PR/issue 허용 |
| containment proof | workflow link, command output, dashboard screenshot path |
| user notification draft | 개인정보 없는 template 또는 제한 문서 |

## Exit Criteria

- containment가 완료되고 신규 노출 경로가 닫혔다.
- 영향 범위와 법무 판단 상태가 기록됐다.
- 사용자 통지/신고 필요 여부가 결정됐다.
- 재발 방지 issue 또는 PR이 생성됐다.
- `docs/legal/privacy-tabletop-exercise-template.md` 형식으로 postmortem과 follow-up owner를 남겼다.

## Validation

- 분기 1회 또는 상용 출시 전 1회 tabletop exercise를 실행한다.
- 테스트 시나리오: "GitHub Actions artifact에 redaction 누락 log가 포함됨".
- exercise evidence는 실제 개인정보 없이 incident id, 참여자, decision log, missing control, follow-up issue만 남긴다.
