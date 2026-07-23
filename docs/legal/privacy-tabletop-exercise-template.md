# Privacy Tabletop Exercise Template

개인정보 운영 runbook을 분기 1회 또는 상용 출시 전 1회 검증하기 위한 기록 양식이다. 실제 개인정보, secret, token, 원본 log는 이 문서나 repository에 기록하지 않는다.

## Exercise Header

| 항목 | 값 |
| --- | --- |
| Exercise id | `privacy-tabletop-YYYYMMDD-NN` |
| Date |  |
| Facilitator |  |
| Participants | Service owner, privacy contact, security owner, infrastructure owner, legal reviewer |
| Scenario |  |
| Related runbook |  |

## Scenario Examples

- GitHub Actions artifact에 redaction 누락 application log가 포함됨.
- 삭제 완료된 테스트 계정이 restore drill 후 일부 cache에 다시 보임.
- optional analytics가 opt-out 후에도 web vital payload를 전송함.
- processor region 또는 DPA 확인 전 외부 email provider가 활성화됨.

## Timeline

| Time | Event | Decision | Owner | Evidence |
| --- | --- | --- | --- | --- |
|  | Detection |  |  |  |
|  | Triage |  |  |  |
|  | Containment |  |  |  |
|  | User/legal decision |  |  |  |
|  | Recovery |  |  |  |

## Control Checklist

| Control | Pass/Fail | Evidence | Follow-up |
| --- | --- | --- | --- |
| Owner assigned within 15 minutes |  |  |  |
| Sensitive evidence kept out of repository |  |  |  |
| Affected data categories identified |  |  |  |
| Processor impact checked |  |  |  |
| User notification/legal review path identified |  |  |  |
| Deletion/export impact checked |  |  |  |
| Backup restore privacy gate considered |  |  |  |
| Follow-up issue created for missing control |  |  |  |

## Exit Record

- Final decision:
- Missing controls:
- Follow-up issue links:
- Evidence location:
- Next exercise due:
