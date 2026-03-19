# Flyway Test Baseline Policy

## 목적
- 로컬/CI/운영 간 스키마 재현 경로를 Flyway로 일원화한다.
- 신규 DB에서도 동일한 절차로 스키마를 재구성할 수 있게 한다.

## 경로
- 운영 마이그레이션: `back/src/main/resources/db/migration`
- 테스트 베이스라인/재현 마이그레이션: `back/src/main/resources/db/migration-test`

## 현재 baseline
- `V20260319_01__baseline_schema.sql`
- 빈 DB에서 테스트 실행 시 baseline + 이후 버전 스크립트 순으로 적용된다.

## 변경 규칙
1. 이미 배포/공유된 버전드 마이그레이션 파일(`V*__*.sql`)은 수정하지 않는다.
2. 스키마 변경은 항상 새 버전 파일을 추가한다.
3. 운영 반영이 필요한 변경은 `db/migration`에 추가한다.
4. 테스트 빈 DB 재현을 위해 필요한 변경은 `db/migration-test`에도 같은 의미의 새 버전을 추가한다.
5. 테스트 프로파일은 Flyway만 스키마 변경 경로로 사용한다.

## 테스트 실행 원칙
- 기본 `test` 태스크는 compose 기반 통합테스트를 유지한다.
- Testcontainers 기반 검증은 `testcontainersTest` 태스크에서 점진 확대한다.
