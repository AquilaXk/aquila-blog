<p align="center">
  <img src="README.assets/aquila-icon.png" alt="Aquila Blog Platform 아이콘" width="80" height="80" />
</p>

<h1 align="center">Aquila Blog Platform</h1>

<p align="center">
  <strong>기술 블로그와 서비스 표면을 뒷받침하는 백엔드 API, OpenAPI 공개 계약, 홈서버 블루/그린 플랫폼</strong>
  <br />
  Spring Boot 4.1.1(Kotlin 2.4.10, Java 25) · PostgreSQL(PGroonga) · Redis 7.4 · MinIO · Caddy
  <br />
  <a href="https://blog.aquilaxk.site"><b>blog.aquilaxk.site 바로가기 ↗</b></a>
</p>

<p align="center">
  <img src="README.assets/portfolio/aquila-blog-architecture.png" alt="Aquila Blog Platform 아키텍처 다이어그램" width="840" />
</p>

<p align="center">
  <a href="https://github.com/AquilaXk/aquila-blog/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/AquilaXk/aquila-blog/ci.yml?branch=main&amp;label=CI&amp;style=flat-square" alt="CI" /></a>
  <a href="https://github.com/AquilaXk/aquila-blog/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/AquilaXk/aquila-blog/security.yml?branch=main&amp;label=Security&amp;style=flat-square" alt="Security" /></a>
  <a href="https://github.com/AquilaXk/aquila-blog/releases/latest"><img src="https://img.shields.io/github/v/release/AquilaXk/aquila-blog?label=Release&amp;style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License MIT" /></a>
  <a href="https://github.com/sponsors/AquilaXk"><img src="https://img.shields.io/github/sponsors/AquilaXk?style=flat-square&amp;logo=githubsponsors&amp;label=Sponsors" alt="GitHub Sponsors" /></a>
</p>

<p align="center">
  <a href="https://blog.aquilaxk.site"><b>운영 서비스</b></a> ·
  <a href="#주요-기능"><b>주요 기능</b></a> ·
  <a href="#아키텍처"><b>아키텍처</b></a> ·
  <a href="#빠른-시작"><b>빠른 시작</b></a> ·
  <a href="#문서"><b>문서</b></a> ·
  <a href="https://github.com/AquilaXk/aquila-blog-web"><b>Web 저장소 ↗</b></a>
</p>

`Aquila Blog Platform`은 [blog.aquilaxk.site](https://blog.aquilaxk.site), [www.aquilaxk.site](https://www.aquilaxk.site), [easysubway.aquilaxk.site](https://easysubway.aquilaxk.site)를 지탱하는 백엔드 API, 데이터 계층, 홈서버 인프라 저장소입니다. 웹 프론트엔드 UI와 마크다운 에디터 스튜디오는 [AquilaXk/aquila-blog-web](https://github.com/AquilaXk/aquila-blog-web)이 담당합니다. 이 저장소는 공개 API 계약 정본을 생성해 웹 `main` 브랜치로 동기화하고 웹 컨테이너 이미지를 받아 무중단 배포까지 수행합니다.

## 주요 기능

- **도메인 경계와 커밋 후 후속 처리** — `post`, `member`, `cloud`, `home` 모듈로 나누고 DB 커밋 이후(`AFTER_COMMIT`)에만 캐시 무효화, 첨부 파일 보존 주기 동기화, 추천 피처 갱신, 도메인 이벤트 발행을 실행합니다.
- **글 작성·발행 백엔드** — 비관적 락 기반 예약 발행 스케줄러, 연재 시리즈 순서 관리, 정본 URL 검증, 다중 임시초안, 리비전 이력, 위키링크 카탈로그와 역링크 API를 제공합니다.
- **공개 읽기 캐시와 전문 검색** — PostgreSQL PGroonga 전문 검색과 `page + cursor` 하이브리드 피드를 지원하며 응답별 Weak ETag(`304`)와 `Cache-Tag`·`Surrogate-Key` 무효화로 읽기 지연을 낮춥니다.
- **클라우드 드라이브와 미디어 방어** — 이미지 매직바이트·픽셀 차원 선검증, ZIP·TAR·TGZ·SVG·AVIF 검사, 멀티파트 이어올리기, 서명된 외부 재생·공유 토큰, 썸네일 렌더링을 처리합니다.
- **단일 관리자 인증과 Fail-Closed 경계** — 이메일 8자리 코드 검증과 서버 세션(`AdminSessionPrincipal`) 토큰 회전으로 `/post/api/v1/adm/**` 등 관리자 경로를 보호하고 공개 상세 경로(`/post/api/v1/posts/{id}`)의 미공개 글 노출과 엣지 내부 엔드포인트(`/actuator/prometheus`, `/api/internal/metrics`) 접근을 차단합니다.
- **계약 주도 저장소 동기화** — OpenAPI 명세, 에러 코드, 요약 픽스처를 `contracts/public-api/`에 내보내고 SHA-256 매니페스트 검증 뒤 웹 저장소 `main`에 직접 전달합니다.
- **불변 GHCR 블루/그린 배포와 백업** — 동일 커밋 SHA에서 `CI`와 `Security`(OWASP·CodeQL·Trivy·SBOM)를 통과한 이미지만 승격하고 홈서버 원격 롤아웃, 자동 롤백, 암호화 백업 복원 드릴을 실행합니다.

## 아키텍처

| 영역 | 경로 | 역할 |
| --- | --- | --- |
| 백엔드 API | [`back/`](back) | `post` · `member` · `cloud` · `home` 도메인 API, 인증, 작업 큐, Flyway 마이그레이션 |
| 공개 API 계약 | [`contracts/public-api/`](contracts/public-api) | OpenAPI 사양, 에러 코드, 요약 픽스처 정본 및 SHA-256 매니페스트 |
| 홈서버 배포 | [`deploy/homeserver/`](deploy/homeserver) | Caddy 동일 출처 라우팅, Blue/Green 롤아웃, 자동 롤백, 암호화 외부 백업 |
| 관측·부하 시험 | [`deploy/homeserver/monitoring/`](deploy/homeserver/monitoring), [`perf/k6/`](perf/k6) | Prometheus · Grafana · Loki/Promtail 지표·로그 수집과 k6 읽기·카오스 시나리오 |
| 가드·배포 게이트 | [`tools/`](tools), [`.github/workflows/`](.github/workflows) | 저장소 경계, 추적 금지 파일, 훅 드리프트, Flyway N-1 호환성, 테스트 인벤토리 검사 |

<details>
<summary><b>스택 및 런타임 구성</b></summary>

- **애플리케이션**: Spring Boot 4.1.1, Kotlin 2.4.10, Java 25 (JVM release 24), QueryDSL 7.6, SpringDoc OpenAPI 3.1.1
- **데이터·스토리지**: PostgreSQL(PGroonga 전문 검색), Redis 7.4(AOF 영속, 캐시 보조, ShedLock 7.10.1), MinIO(S3 API 미디어·클라우드 멀티파트 저장)
- **엣지·배포**: Cloudflare Tunnel → Caddy(동일 출처 라우팅, Blue/Green 업스트림 전환, 비공개·메트릭 경로 차단)
- **관측**: Prometheus, Grafana, Loki/Promtail, Uptime Kuma, k6 부하·카오스 시험

</details>

<details>
<summary><b>저장소 구조</b></summary>

```
aquila-blog/
├── .githooks/                # 사전 커밋·푸시·계약 동기화 훅
├── README.assets/            # README 아이콘 및 아키텍처 다이어그램
├── back/                     # Spring Boot + Kotlin API 서버
├── contracts/public-api/     # OpenAPI 명세·에러 코드·매니페스트 정본
├── deploy/homeserver/        # Caddy, Blue/Green 롤아웃, 모니터링, 백업 스크립트
├── docs/                     # 설계 계약 및 운영 런북
├── perf/k6/                  # 읽기·클라우드·카오스 부하 시험
└── tools/                    # 경계·계약·보안·CI 인벤토리 가드
```

</details>

## 빠른 시작

로컬 실행에는 **Java 25**, **Node.js 20.19+**, **Docker(Compose 포함)**가 필요합니다.

```sh
git config core.hooksPath .githooks                        # 저장소 Git 훅 연결
docker compose -f back/devInfra/docker-compose.yml up -d   # 로컬 PostgreSQL·Redis·MinIO 실행
./back/gradlew -p back bootRun                             # 백엔드 API 실행 (http://localhost:8080)
```

<details>
<summary><b>품질 게이트 · 계약 검증 · 부하 시험 명령</b></summary>

```sh
./back/gradlew -p back ktlintCheck                         # Kotlin 코드 스타일 검사
./back/gradlew -p back check                               # 전체 단위·통합 테스트
./back/gradlew -p back test \
  --tests "com.back.global.springDoc.OpenApiContractExportTest" \
  --tests "com.back.global.contracts.ErrorCodeContractExportTest" \
  --rerun-tasks
node tools/contracts/check-public-contracts.mjs            # 공개 API 계약 동기화·드리프트 검증
bash tools/guards/check-forbidden-tracked-files.sh         # 비허용 문서·메타데이터 검사
node tools/repo-boundary/check-platform-boundary.mjs       # 플랫폼-웹 저장소 경계 검사
node tools/ci/verify-test-execution-inventory.mjs          # 테스트 실행 인벤토리 검증
```

주요 작업은 루트 [`Makefile`](Makefile)(`make dev-infra`, `make test-fast`, `make test`, `make lint`, `make check-contracts`, `make validate-env`)로도 바로 실행할 수 있습니다. 부하·카오스 시나리오 실행 방법은 [k6 부하 시험 가이드](perf/k6/README.md)에 있습니다.

</details>

## 문서

- [문서 허브](docs/README.md): 전체 설계 계약 및 운영 런북 목록
- [백엔드 가이드](back/README.md): 도메인 모듈 구조, 인증 흐름, 캐시·보존 정책, OpenAPI 동기화
- [저장소 경계 계약](docs/design/repository-boundaries.md): 플랫폼-웹 저장소 분리 원칙과 계약 방향
- [캐시 정합성 계약](docs/design/cache-consistency-contract.md): 공개 조회 캐시, ETag, 무효화 범위
- [태스크 큐 보장](docs/design/task-delivery-guarantees.md): 비동기 작업 재시도, 멱등성, DLQ 재생
- [홈서버 보안 강화](deploy/homeserver/HARDENING.md): SSH, UFW, Redis 영속 계약, 롤백 절차
- [백업·복원 런북](docs/ops/backup-restore-runbook.md): 암호화 외부 백업 복원 및 트래픽 전환 절차
- [변경 이력](CHANGELOG.md): 버전별 주요 기능 및 수정 이력

## 문제 신고

버그는 [이슈 양식](https://github.com/AquilaXk/aquila-blog/issues/new/choose)으로 신고해 주세요. 기능 요청과 PR은 받지 않습니다. 보안 취약점은 공개 이슈 대신 [SECURITY.md](SECURITY.md)의 비공개 제보 경로로 알려 주세요.

## 후원

Aquila Blog Platform은 무료 오픈소스입니다. 후원금은 개발 시간과 홈서버 운영·테스트 비용에 쓰입니다. [github.com/sponsors/AquilaXk](https://github.com/sponsors/AquilaXk)

### 후원해 주신 분들

아직 없습니다 — [후원하기](https://github.com/sponsors/AquilaXk)

## 라이선스

가져다 쓴 코드의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다. 블로그 본문과 미디어 콘텐츠([blog.aquilaxk.site](https://blog.aquilaxk.site))는 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따릅니다.

이 프로젝트 자체 코드는 [MIT](LICENSE) 라이선스로 배포합니다.
