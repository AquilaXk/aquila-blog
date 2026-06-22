# Privacy Launch Gate Checklist

이 문서는 `aquila-blog` 상용 출시 전 개인정보·법적 고지·동의·외부처리·보유기간·운영 대응을 한 번에 판정하는 decision artifact다. 일반 release gate는 `docs/design/launch-gate-operations.md`를 따르고, 개인정보/법무 항목은 이 문서가 우선한다.

## Current Decision

| 항목 | 현재 판정 | 근거 | 다음 조치 |
| --- | --- | --- | --- |
| Production launch | `block` | #998, #1000, #1001, #1002, #1003, #1004, #1006, #1007, #1008이 open | 각 issue 완료 후 이 문서의 matrix와 evidence를 갱신한다. |
| Public policy gate | `pass` | #1024, #1025, #1026, #1027, #1028 closed. `status: effective` 정책은 `reviewRequired=0`과 내부 검토 문구 미노출을 검증 대상으로 둔다. | `node tools/legal/validate-legal-policies.mjs`를 PR마다 실행한다. |
| Legal sign-off | `block` | 실제 사업자 요건, processor 계약, 국외이전, 최종 정책 문구는 전문가 확인 전이다. | 출시 승인 전 법무/운영 owner가 evidence와 결정을 남긴다. |
| Operations readiness | `block` | 보유기간 자동 파기와 백업 암호화/복구 privacy guard가 open issue다. | #1000, #1004 완료 후 재판정한다. |

## Owner And Contact

| 역할 | Owner | 출시 전 확인 |
| --- | --- | --- |
| 서비스 운영 owner | AquilaXk | 운영 문의 수신, 권리 요청 처리, incident escalation을 승인한다. |
| 개인정보 문의 수신처 | `aquilaxk10@gmail.com` | 실제 수신 가능 여부를 launch PR evidence에 남긴다. |
| 법무 확인 owner | 외부 전문가 또는 서비스 운영자가 지정한 검토자 | 이 문서는 법률 자문이 아니며, 최종 법적 판단을 대체하지 않는다. |
| 기술 evidence owner | PR 작성자 | 코드/정책/데이터맵/테스트 결과를 PR 본문과 이 문서에 연결한다. |

## Follow-up Issue Matrix

| Issue | 상태 | 분류 | 대상 | Evidence requirement | Launch 판정 |
| --- | --- | --- | --- | --- | --- |
| #994 | Closed | 필수 출시 전 완료 | 데이터맵, 법적 근거 registry | `legal/data-map/*.yaml`와 공개 정책 참조 | 완료 |
| #995 | Closed | 필수 출시 전 완료 | 정책 버전관리와 공개 페이지 | `legal/policies/*.yaml`, `/privacy`, `/terms`, `/cookies` | 완료 |
| #996 | Closed | 필수 출시 전 완료 | 이메일 가입 동의와 증빙 저장 | backend acceptance version/hash, signup flow evidence | 완료 |
| #997 | Closed | 필수 출시 전 완료 | Kakao OAuth 신규 가입 pending 동의 | OAuth 신규 가입 동의 flow evidence | 완료 |
| #998 | Open | 필수 출시 전 완료 | 회원가입 token/email URL 노출 제거 | token hash 저장, URL/log redaction 테스트 | 차단 |
| #999 | Closed | 필수 출시 전 완료 | 권리 요청, export, 계정 탈퇴 | privacy request/export/delete 테스트 | 완료 |
| #1000 | Open | 필수 출시 전 완료 | 보유기간 설정과 자동 파기 job | retention config, scheduled deletion test, dry-run log | 차단 |
| #1001 | Open | 필수 출시 전 완료 | 로그 최소화와 민감정보 redaction | request/application log redaction test, sample log | 차단 |
| #1002 | Open | 필수 출시 전 완료 | analytics/cookie consent manager와 opt-out | consent UI, storage inventory, analytics disabled evidence | 차단 |
| #1003 | Open | 필수 출시 전 완료 | Gemini tag recommendation 외부 처리 안전화 | default disabled config, redaction/cache regression test | 차단 |
| #1004 | Open | 필수 출시 전 완료 | backup 암호화, deletion tombstone, restore privacy guard | backup artifact encryption, restore drill, deletion tombstone evidence | 차단 |
| #1005 | Closed | 필수 출시 전 완료 | 침해사고 대응 runbook | `docs/legal/*.md`, tabletop exercise template, owner/contact/evidence 절차 | 완료 |
| #1006 | Open | 필수 출시 전 완료 | 정책·코드 privacy drift gate | CI command, failing fixture example, passing workflow link | 차단 |
| #1007 | Open | 필수 출시 전 완료 | 신규 개인정보 수집 feature flag 동결 | flag inventory, disabled-by-default evidence | 차단 |
| #1008 | Open | 필수 출시 전 완료 | 기존 사용자 재동의와 legacy 고지 migration | legacy account migration, re-consent prompt, audit log evidence | 차단 |
| #1024 | Closed | 필수 출시 전 완료 | 공개 정책과 legal acceptance version/hash 단일화 | `ActiveLegalDocumentMetadata`와 public policy hash evidence | 완료 |
| #1025 | Closed | 필수 출시 전 완료 | effective 정책의 내부 검토 문구 제거 | `reviewRequired=0`, internal phrase validator, page e2e | 완료 |
| #1026 | Closed | 출시 후 보완 가능 | 법적 정책 탐색성과 원문 검증 UX | policy URL, TOC, hash/download 검증, live page evidence | 완료 |
| #1027 | Closed | 필수 출시 전 완료 | cookie/sessionStorage/localStorage inventory | browser storage registry, retention mapping evidence | 완료 |
| #1028 | Closed | 필수 출시 전 완료 | 정책·동의·추적 회귀 검증 세트 | legal policy and tracking regression test output | 완료 |

`출시 후 보완 가능`은 이미 closed이고 사용자 권리, 보안, 법적 고지의 필수 통제에 영향을 주지 않는 개선성 항목에만 허용한다. Open 항목은 모두 launch-blocking으로 유지한다.

## Go/No-Go Criteria

| Gate | Pass 조건 | Block 조건 |
| --- | --- | --- |
| 후속 issue 상태 | 위 matrix의 `필수 출시 전 완료` 항목이 모두 closed이고 evidence가 PR 또는 연결 문서에 있다. | 필수 항목이 open이거나 evidence link가 없다. |
| 공개 정책 원본 | `legal/policies/*.yaml`의 공개 시행 문서가 `status: effective`이고 `reviewRequired`가 0개다. | effective 정책에 내부 검토 문구, 미확정 수탁자/국외이전/보유기간 문구, `출시 gate`, `추후 확정`, `구현 후 제공` 같은 표현이 남아 있다. |
| 정책-코드 대조 | 개인정보처리방침, 이용약관, 쿠키 정책이 data map, processor registry, retention matrix, backend legal metadata와 일치한다. | 정책 본문과 실제 수집/저장/전송/보유 동작이 다르다. |
| Signup/OAuth consent | email signup과 Kakao OAuth 신규 가입 모두 현재 정책 version/hash와 필수 동의를 저장한다. | 기존 동의 버전이 계속 acceptance로 인정되거나 신규 가입자가 정책을 보지 않고 가입된다. |
| Optional tracking | analytics/RUM/cookie tracking이 opt-in 또는 명시적 설정에 따라 비활성화 가능하다. | 비필수 tracking이 동의 전 실행되거나 opt-out 뒤에도 계속 전송된다. |
| External processing | Gemini, analytics, backup, email, hosting processor가 registry와 정책에 반영되고 기본 비활성/최소전송 원칙을 지킨다. | processor 누락, secret/PII 전송 가능성, 비활성화 불가 상태가 남아 있다. |
| 운영 대응 | 문의 메일, 권리 요청, incident response, 삭제/복구 절차 owner가 있고 dry-run 또는 command evidence가 있다. | 운영 owner가 없거나 실제 처리 경로가 문서뿐이다. |

## Legal Review Handoff

법무 확인이 필요한 항목과 기술 검증 항목을 섞지 않는다.

| 법무 확인 필요 | 기술 evidence |
| --- | --- |
| 실제 사업자 정보, 개인정보 보호책임자 또는 담당자 표기 적정성 | 공개 정책 페이지의 담당자/문의 메일 렌더링 |
| processor 계약, 국외이전 고지, 재위탁 조건 | `legal/vendors/processors.yaml`와 정책 processor section 일치 |
| 보유기간과 파기 예외의 법적 근거 | `legal/data-map/retention-matrix.yaml`와 자동 파기 job evidence |
| 미성년자, OAuth, email signup 동의 문구의 충분성 | 가입/재동의 flow가 현재 version/hash를 저장한다는 테스트 |
| 침해사고 통지 대상과 기한 | incident runbook, alert receiver, escalation drill |

이 저장소 작업은 법적 리스크 0%를 보장하지 않는다. 강행 법규, 실제 사업자 요건, processor 계약, 국외이전 세부 조건, 최종 문구 적정성은 출시 전 전문가 검토가 필요하다.

## Policy-Code Comparison Procedure

1. `node tools/legal/validate-legal-policies.mjs`로 policy schema, hash, active metadata, internal phrase 금지를 확인한다.
2. `legal/data-map/processing-activities.yaml`, `legal/data-map/retention-matrix.yaml`, `legal/vendors/processors.yaml`를 공개 정책의 수집 항목, 보유기간, processor 항목과 대조한다.
3. `back/src/main/kotlin/com/back/boundedContexts/member/subContexts/legalAcceptance/application/service/ActiveLegalDocumentMetadata.kt`의 version/hash가 공개 정책과 같은지 확인한다.
4. `front/src/libs/legal/serverPolicySource.ts`와 `/privacy`, `/terms`, `/cookies`, `/legal/history`가 current URL, 이전 버전 URL, hash/download evidence를 노출하는지 확인한다.
5. signup, Kakao OAuth, analytics/RUM, Gemini, logs, backup, deletion/export 관련 issue의 PR evidence를 matrix에 연결한다.

## Post-Launch Monitoring

| 시점 | 확인 항목 | Evidence |
| --- | --- | --- |
| 출시 후 7일 | 개인정보 문의 메일 수신 여부, signup/OAuth 동의 저장 오류, privacy request queue, analytics opt-out 오류, Gemini 외부 전송 로그, redaction 누락 로그 | 운영 메일 확인 note, backend/application log sample, workflow or dashboard link |
| 출시 후 30일 | 권리 요청 처리 SLA, retention job 실행 결과, deletion tombstone/backup restore drill, processor 변경 여부, policy-code drift CI 결과 | retention/deletion job log, backup restore artifact, issue/PR link |

Monitoring에서 개인정보 누락, 외부 전송, 동의 없는 tracking, 삭제 실패가 확인되면 같은 issue 계열에 follow-up을 만들고 launch gate를 `block`으로 되돌린다.
