# Policy Change Runbook

개인정보처리방침, 이용약관, 쿠키 정책의 version, hash, 시행일, 재동의 필요 여부를 배포하는 절차다.

## Owner

| 역할 | 담당 |
| --- | --- |
| Policy author | Service owner |
| Technical owner | frontend/backend legal metadata 담당 |
| Privacy reviewer | `privacy@aquila-blog.example` 공유 메일함 담당 |
| Legal counsel | 출시 전 지정 필요 |

## Trigger

- 수집 항목, 처리 목적, 보유기간, processor, 국외이전, 사용자 권리 처리, 문의처 변경
- terms/privacy/cookies YAML version 추가 또는 `status: effective` 변경
- backend active legal metadata 또는 signup consent payload 변경

## Change Steps

1. 변경 유형을 `minor_notice`, `material_reconsent`, `legal_correction`, `processor_update` 중 하나로 분류한다.
2. 새 policy YAML을 작성하고 version, publishedAt, effectiveAt, contentSha256를 확정한다.
3. material change이면 재동의 필요 여부와 대상 계정을 기록한다.
4. `ActiveLegalDocumentMetadata.kt`, `front/src/apis/backend/legal.ts`, `front/src/libs/legal/serverPolicySource.ts`가 같은 version/hash를 가리키는지 확인한다.
5. 공개 페이지 `/privacy`, `/terms`, `/cookies`, `/legal/history`에서 current link와 이전 version link를 확인한다.
6. `status: effective` 정책에는 `reviewRequired`, `출시 gate`, `추후 확정`, `구현 후 제공` 같은 내부 문구를 남기지 않는다.
7. 배포 후 live URL에서 정책 제목, 시행일, hash/download, 문의 링크를 확인한다.

## Re-consent Decision

| 변경 | 재동의 판단 |
| --- | --- |
| 필수 수집 항목 증가 | 재동의 필요 |
| processor 또는 국외이전 실질 변경 | 법무 확인 후 재동의 또는 사전 고지 |
| 보유기간 확대 | 재동의 또는 명시 고지 필요 |
| 오탈자, 링크, 담당자 표기 보정 | 고지만 가능할 수 있음 |
| optional tracking 추가 | opt-in consent 필요 |

## Evidence

- policy diff, version/hash table, publishedAt/effectiveAt.
- validator output: `node tools/legal/validate-legal-policies.mjs`.
- backend/frontend active metadata check.
- e2e 또는 live screenshot path for `/privacy`, `/terms`, `/cookies`, `/legal/history`.
- re-consent decision note와 legal review status.

## Exit Criteria

- policy YAML, frontend route, backend active metadata가 같은 version/hash다.
- validator와 policy page e2e가 통과했다.
- material change의 재동의 대상과 gate가 확정됐다.
- 사용자 고지 또는 재동의 UI evidence가 PR에 연결됐다.

## Validation

- `node tools/legal/validate-legal-policies.mjs`
- `yarn --cwd front playwright:preflight`
- 정책 페이지 e2e 또는 live URL 확인 결과를 PR evidence table에 남긴다.
