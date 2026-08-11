# Contributing

이 저장소의 이슈와 PR은 **문제 → 목표 → 범위 → 완료 조건 → 위험에 맞는 검증** 순서로 작성합니다.
모든 이슈에 전체 테스트, 모든 edge case, commit 계획과 production 관측을 선행 요구하지 않습니다.

## Issue 유형 선택

| 유형 | 사용 시점 |
|---|---|
| [Bug / Fix](https://github.com/AquilaXk/aquila-blog/issues/new?template=bug_report.yml) | 기대 동작과 실제 동작이 어긋난 재현 가능한 결함 |
| [Task / Feature / Refactor](https://github.com/AquilaXk/aquila-blog/issues/new?template=task_request.yml) | 기능, 리팩터링, 테스트, 문서와 일반 유지보수 |
| [Ops / Security / Data](https://github.com/AquilaXk/aquila-blog/issues/new?template=ops_security_data.yml) | 배포, 운영 안정성, 보안·개인정보, 데이터 전환, 성능 위험 |
| [Epic / Tracker](https://github.com/AquilaXk/aquila-blog/issues/new?template=epic_tracker.yml) | 여러 child issue의 owner, 순서와 종료 상태 관리 |

이슈를 만들기 전에 [열린 이슈](https://github.com/AquilaXk/aquila-blog/issues)를 검색해 중복 owner를 확인합니다.

## Definition of Ready

구현을 시작하기 전에 다음이 명확해야 합니다.

- 제목과 Summary만으로 문제 또는 목표가 이해된다.
- 실제 문제·요구의 근거가 있다.
- In Scope와 Out of Scope가 구분돼 있다.
- 관찰 가능한 Acceptance Criteria가 있다.
- Parent, dependency와 repository owner가 명확하다.
- 구현 전 결정이 필요한 blocker가 숨겨져 있지 않다.

구현 세부가 아직 미확정이면 추측해 확정하지 말고 `Approach / Decisions`의 Open questions에 남깁니다.

## 검증 원칙

검증은 변경 위험에 비례합니다.

| 변경 | 기본 검증 |
|---|---|
| 문서·copy·기계적 삭제 | focused syntax/link/build check + required CI |
| 일반 기능·UI·리팩터링 | focused unit/integration + 대표 E2E 또는 manual check + required CI |
| DB·배포·보안·운영 | 핵심 negative fixture + 필요한 dry-run/canary + rollback/recovery + required CI |
| Epic / Tracker | child evidence 링크 집계. Parent에서 child 테스트 재실행 금지 |

전체 suite가 required CI에서 실행되면 같은 검증을 로컬에서 반복할 필요가 없습니다.
미실행 검증은 실제로 필요한 경우에만 이유와 재실행 조건을 기록합니다.

## Pull Request

1. 관련 이슈를 연결합니다. 자동 종료가 맞으면 `Closes #N`, 의존성만 있으면 `Related #N` 또는 전체 URL을 사용합니다.
2. PR에는 실제 변경 결과, 포함·제외 범위와 실행한 검증 결과를 적습니다.
3. UI·API 예시·metric은 리뷰 판단에 필요한 최소 자료만 첨부합니다.
4. Rollout과 rollback은 runtime·data·security 위험이 있을 때만 상세히 작성합니다.
5. 다른 저장소가 소유한 source를 함께 수정하지 않습니다. 교차 저장소 작업은 producer/consumer 이슈를 각각 연결합니다.
6. Draft PR은 핵심 변경과 첫 focused RED→GREEN이 보이면 일찍 엽니다. 전체 검증 완료까지 PR 생성을 미루지 않습니다.

## Commit

권장 commit type:

```text
feat | fix | perf | refactor | test | ci | docs | build | chore
```

한 PR의 commit 수나 사전 commit plan을 이슈 필수 조건으로 두지 않습니다. 리뷰 가능한 논리 단위로만 나눕니다.

## Development setup

실행 환경과 저장소별 명령은 [../README.md](../README.md)를 기준으로 합니다.
