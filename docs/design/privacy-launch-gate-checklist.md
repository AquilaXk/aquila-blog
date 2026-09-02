# Privacy Launch Gate Checklist

이 문서는 `aquila-blog` 상용 출시 전 현재 runtime의 데이터맵·외부처리·보유기간·보안·운영 대응을 판정하는 decision artifact다. 일반 release gate는 `docs/design/launch-gate-operations.md`를 따르고, 이 문서의 current privacy operations 항목은 fail closed로 적용한다.

Follow-up matrix의 source of truth는 `legal/privacy-launch-controls.json`이다. `node tools/privacy/validate-launch-gate-checklist.mjs`는 각 retained control의 issue 상태, launch 판정, evidence reference, deploy SHA 연결 source가 이 문서와 drift되면 실패한다. 퇴역한 공개 signup, OAuth signup, privacy request, tracking consent, legal acceptance, public policy, soft-launch flag evidence는 current control로 다시 등록할 수 없다.

## Current Decision

| 항목 | 현재 판정 | 근거 | 다음 조치 |
| --- | --- | --- | --- |
| Production launch | `pass` | retained controls #994, #1000, #1001, #1004, #1005, #1006, #1027이 closed이고 current evidence가 있다. | runtime 또는 retained evidence가 변경되면 matrix와 source를 함께 갱신한다. |
| Public legal-surface review | `not applicable` | public policy, signup/OAuth, consent, tracking surface가 퇴역했고 current processor·retention operations는 retained controls가 소유한다. | 해당 surface를 재도입하는 tracked work에서 legal·processor·retention evidence를 다시 판정한다. |
| Operations readiness | `pass` | 보유기간 자동 파기와 백업 암호화/복구 privacy guard의 current acceptance가 있다. | runtime 또는 restore evidence가 변경되면 재판정한다. |

## Owner And Contact

| 역할 | Owner | 출시 전 확인 |
| --- | --- | --- |
| 서비스 운영 owner | AquilaXk | 운영 문의 수신, 권리 요청 처리, incident escalation을 승인한다. |
| 개인정보 문의 수신처 | `privacy@aquila-blog.example` | 실제 공유 메일함 수신 가능 여부를 launch PR evidence에 남긴다. |
| 법무 확인 owner | 외부 전문가 또는 서비스 운영자가 지정한 검토자 | 이 문서는 법률 자문이 아니며, 최종 법적 판단을 대체하지 않는다. |
| 기술 evidence owner | PR 작성자 | 코드/정책/데이터맵/테스트 결과를 PR 본문과 이 문서에 연결한다. |

## Follow-up Issue Matrix

| Issue | 상태 | 분류 | 대상 | Evidence requirement | Launch 판정 |
| --- | --- | --- | --- | --- | --- |
| #994 | Closed | 필수 출시 전 완료 | runtime 데이터맵과 처리 근거 registry | 현재 runtime의 `legal/data-map/*.yaml` 정합성 | 완료 |
| #1000 | Closed | 필수 출시 전 완료 | 보유기간 설정과 자동 파기 job | retention config와 scheduled deletion acceptance | 완료 |
| #1001 | Closed | 필수 출시 전 완료 | 로그 최소화와 민감정보 redaction | request/application log redaction acceptance | 완료 |
| #1004 | Closed | 필수 출시 전 완료 | backup 암호화, deletion tombstone, restore privacy guard | backup artifact encryption, restore drill, deletion tombstone acceptance | 완료 |
| #1005 | Closed | 필수 출시 전 완료 | 침해사고 대응 runbook | `docs/legal/*.md`, tabletop exercise template, owner/contact/evidence 절차 | 완료 |
| #1006 | Closed | 필수 출시 전 완료 | 정책·코드 privacy drift gate | CI privacy gate와 failing fixture acceptance | 완료 |
| #1027 | Closed | 필수 출시 전 완료 | cookie/sessionStorage/localStorage inventory | browser storage registry, retention mapping evidence | 완료 |

Open 항목은 모두 launch-blocking으로 유지한다.

## Go/No-Go Criteria

Public policy, public signup, OAuth signup, and optional tracking rows are not current
launch requirements. They are fail-closed reintroduction gates: a new tracked feature
must restore an executable owner and equivalent evidence before exposing that surface.

| Gate | Pass 조건 | Block 조건 |
| --- | --- | --- |
| 후속 issue 상태 | 위 matrix의 `필수 출시 전 완료` 항목이 모두 closed이고 evidence가 PR 또는 연결 문서에 있다. | 필수 항목이 open이거나 evidence link가 없다. |
| 공개 정책 재도입 | 새 canonical source, public-ready validator, current URL evidence가 같은 tracked work에 있다. | owner 없는 문서, 내부 검토 문구, 미확정 processor·국외전송·보유기간 문구가 공개된다. |
| 정책-runtime 재도입 대조 | 새 공개 정책이 data map, processor registry, retention matrix, 실제 runtime과 일치한다. | 정책과 실제 수집·저장·전송·보유 동작이 다르다. |
| Signup/OAuth 재도입 | 새 가입 flow가 current policy identity와 필수 동의를 저장하는 acceptance를 갖는다. | 새 가입자가 current policy를 확인하지 않거나 동의 identity를 저장하지 않는다. |
| Optional tracking 재도입 | 새 analytics/RUM/cookie tracking이 명시적 opt-in과 withdrawal acceptance를 갖는다. | 비필수 tracking이 동의 전 또는 철회 후 전송된다. |
| External processing | backup, email, hosting processor가 registry와 data map에 반영되고 최소전송 원칙을 지킨다. | processor 누락, secret/불필요한 개인 데이터 전송 가능성이 남아 있다. |
| 운영 대응 | incident response와 보유·삭제·복구 절차 owner가 있고 dry-run 또는 command evidence가 있다. | 운영 owner가 없거나 실제 처리 경로가 문서뿐이다. |

## Legal Review Handoff

법무 확인이 필요한 항목과 기술 검증 항목을 섞지 않는다. 공개 정책과
signup 관련 행은 해당 surface를 재도입할 때만 적용한다.

| 법무 확인 필요 | 기술 evidence |
| --- | --- |
| 실제 사업자 정보, 개인정보 보호책임자 또는 담당자 표기 적정성 | 재도입된 공개 정책 페이지의 담당자/문의 메일 렌더링 |
| processor 계약, 국외이전 고지, 재위탁 조건 | `legal/vendors/processors.yaml`와 runtime data map 일치 |
| 보유기간과 파기 예외의 법적 근거 | `legal/data-map/retention-matrix.yaml`와 자동 파기 job evidence |
| 미성년자, OAuth, email signup 동의 문구의 충분성 | 재도입된 가입 flow가 current policy identity를 저장한다는 테스트 |
| 침해사고 통지 대상과 기한 | incident runbook, alert receiver, escalation drill |

이 저장소 작업은 법적 리스크 0%를 보장하지 않는다. 강행 법규, 실제 사업자 요건, processor 계약, 국외이전 세부 조건, 최종 문구 적정성은 출시 전 전문가 검토가 필요하다.

## Runtime And Reintroduction Comparison Procedure

1. Current runtime은 `legal/data-map/processing-activities.yaml`, `legal/data-map/retention-matrix.yaml`, `legal/vendors/processors.yaml`와 대조한다.
2. 관리자 인증·세션·보안 이벤트·action log·콘텐츠·파일·백업의 producer, consumer, processor, retention owner를 확인한다.
3. `node tools/legal/validate-privacy-data-map.mjs`와 `node tools/privacy/ci-privacy-gate.mjs`로 current evidence와 retired-reference 부재를 확인한다.
4. 공개 정책, signup/OAuth 또는 optional tracking을 재도입하면 새 issue에서 canonical identity, producer/consumer, public URL, consent/withdrawal acceptance를 구현한 뒤 current matrix에 새 control을 추가한다.
5. redaction, retention, backup/restore, incident 및 조건부 재도입 evidence를 관련 PR에 연결한다.

## Post-Launch Monitoring

| 시점 | 확인 항목 | Evidence |
| --- | --- | --- |
| 출시 후 7일 | 관리자 인증·세션 오류, redaction 누락 로그, 외부 processor 오류 | backend/application log sample, workflow or dashboard link |
| 출시 후 30일 | retention job 실행 결과, deletion tombstone/backup restore drill, processor 변경 여부, runtime-data drift CI 결과 | retention/deletion job log, backup restore artifact, issue/PR link |

Monitoring에서 registry 누락, 불필요한 외부 전송, redaction 또는 삭제 실패가 확인되면 같은 issue 계열에 follow-up을 만들고 launch gate를 `block`으로 되돌린다. 퇴역 surface가 다시 관측되면 해당 reintroduction gate를 즉시 `block`으로 판정한다.
