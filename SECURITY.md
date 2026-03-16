# Security Policy

## Supported Versions

현재 운영 브랜치는 `main` 기준 최신 배포 버전만 지원합니다.

## Reporting a Vulnerability

보안 이슈는 공개 이슈로 올리지 말고, 아래 순서로 제보해 주세요.

1. GitHub Security Advisory(Private Report)로 제보
2. 재현 절차, 영향 범위, 임시 우회 방법(있다면) 포함
3. POC가 있다면 최소 재현 형태로 첨부

운영자가 확인 후 우선순위를 분류해 대응합니다.

- P0 (원격 코드 실행, 인증 우회, 데이터 유출 가능): 가능한 즉시 핫픽스
- P1 (권한 상승, 주요 기능 DoS): 24~72시간 내 대응 시작
- P2 (중간 위험도): 정기 배포 주기 내 반영

## Scope

주요 보안 점검 범위:

- 인증/인가 (`/api/v1/**`, `/system/api/v1/**`)
- 관리자 API 및 운영 도구
- 업로드/이미지 조회/파일 정리 배치
- 외부 연동(SMTP, OAuth, SSE)
- 배포 파이프라인 및 런타임 설정(Secrets, Actuator 노출, CORS/Cookie)

## Operational Baseline

상용 운영 시 기본 원칙:

- 기본값은 최소 노출(예: production actuator는 `health`만 노출)
- 민감 설정은 코드에 하드코딩하지 않고 secret/env로 주입
- DB 스키마 변경은 Flyway migration으로 이력 관리
- CI 필수 게이트(`ktlint`, 테스트, 프론트 lint/build/smoke)를 통과해야 배포
