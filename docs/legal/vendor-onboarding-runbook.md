# Vendor Onboarding Runbook

새 processor, sub-processor, analytics, AI, email, hosting, monitoring, backup provider를 추가하거나 처리 목적을 바꿀 때 사용하는 절차다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Service owner | AquilaXk |
| Security reviewer | Service owner가 지정 |
| Privacy reviewer | `aquilaxk10@gmail.com` 운영 담당 |
| Legal counsel | 출시 전 지정 필요 |

## Trigger

- `legal/vendors/processors.yaml`에 processor를 추가 또는 변경
- `legal/data-map/processing-activities.yaml`의 processors, overseasTransfer, retentionRule 변경
- Gemini, analytics/RUM, SMTP, Vercel, Cloudflare, backup storage, monitoring provider의 데이터 범위 변경

## Review Steps

1. processor 이름, 서비스 URL, 처리 목적, 데이터 카테고리, data subject, 국가/region, 보유기간, sub-processor 여부를 기록한다.
2. DPA, 이용약관, 보안 문서, 국외이전 조건, 삭제/반환 조건을 확인한다.
3. 최소 전송 원칙을 검토한다. secret, access token, raw email, OAuth subject 원문이 불필요하게 전송되면 block한다.
4. feature flag 또는 env kill switch가 있는지 확인한다.
5. `legal/vendors/processors.yaml`, `legal/data-map/processing-activities.yaml`, 공개 정책 문서의 processor section을 같은 PR에서 갱신한다.
6. 법무 확인 필요 항목은 `reviewRequired` 또는 launch gate issue에 남기고 `status: effective` 공개 정책에는 내부 검토 문구를 노출하지 않는다.

## Approval Gate

| Gate | Pass | Block |
| --- | --- | --- |
| Data minimization | 필요한 필드만 전송 | raw secret/token/불필요한 PII 전송 |
| Contract evidence | DPA 또는 동등한 계약 검토 기록 존재 | 계약/삭제 조건 불명확 |
| Overseas transfer | 국가, 이전 항목, 보유기간, 사용자 고지 판단 기록 | 국외이전 여부 미확인 |
| Runtime control | env/feature flag로 disable 가능 | 장애 또는 거부 시 즉시 중단 불가 |
| Policy alignment | data map, processor registry, policy가 일치 | 문서와 코드 동작 불일치 |

## Evidence

- processor review note: provider, scope, data categories, legal review status.
- DPA/security document link 또는 restricted evidence path.
- policy/data-map diff.
- kill switch 또는 env var 확인 command output.
- test 또는 dry run request/response sample은 redacted 상태만 저장한다.

## Exit Criteria

- registry, data map, policy, code configuration이 같은 의미로 정렬됐다.
- legal counsel이 필요한 항목과 기술적으로 검증된 항목이 분리됐다.
- processor 장애 또는 계약 문제 발생 시 disable 절차가 문서화됐다.
- launch gate matrix에서 관련 issue 상태와 evidence가 갱신됐다.

## Validation

- `node tools/legal/validate-legal-policies.mjs`를 실행한다.
- processor id가 `legal/data-map/processing-activities.yaml`와 `legal/vendors/processors.yaml`에 일관되게 존재하는지 확인한다.
- optional integration은 disabled 환경에서 외부 요청이 발생하지 않는지 테스트한다.
