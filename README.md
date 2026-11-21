# Aquila Blog Platform

**개인 기술 블로그와 서비스 표면을 뒷받침하는 백엔드 API, OpenAPI 공개 계약, 홈서버 블루/그린 배포 플랫폼**

Aquila Blog Platform은 [blog.aquilaxk.site](https://blog.aquilaxk.site)와 [www.aquilaxk.site](https://www.aquilaxk.site)를 운영하는 백엔드 API, 데이터 계층, 홈서버 인프라를 관리하는 저장소입니다. Spring Boot 4.1(Kotlin) API 서버와 PostgreSQL(PGroonga), Redis, MinIO, Caddy 리버스 프록시, 관측·백업 스크립트를 한곳에서 다룹니다.

웹 프론트엔드 소스, 에디터 스튜디오, 회사·다운로드 페이지 UI는 [AquilaXk/aquila-blog-web](https://github.com/AquilaXk/aquila-blog-web)이 소유합니다. 이 저장소는 공개 API 계약 정본(`contracts/public-api/`)을 생성하고 웹 저장소로 전달하는 역할까지 맡습니다.

![Aquila Blog Architecture](README.assets/portfolio/aquila-blog-architecture.png)

## 주요 구성

* 백엔드 API(`back/`): 게시글 피드·상세·검색, 관리자 인증, 프로필 워크스페이스, 미디어 업로드·클라우드 재생, Flyway 마이그레이션
* 공개 API 계약(`contracts/public-api/`): OpenAPI 명세, 에러 코드, 요약 픽스처 정본 생성 및 SHA-256 매니페스트 검증
* 홈서버 배포(`deploy/homeserver/`): Blue/Green 무중단 배포, Caddy 리버스 프록시, DB/스토리지 외부 백업 및 롤백 스크립트
* 관측과 부하 시험(`deploy/homeserver/monitoring/`, `perf/k6/`): Prometheus, Grafana, Loki/Promtail 설정 및 k6 읽기 경로 부하·카오스 시나리오
* 저장소 가드(`tools/`): 경계 검사, 추적 금지 파일 검사, Flyway N-1 배포 안전성 검사, Git 훅 드리프트 검증

설계 계약과 운영 런북은 [docs/README.md](docs/README.md), 백엔드 세부 구조는 [back/README.md](back/README.md), 홈서버 보안 점검 항목은 [deploy/homeserver/HARDENING.md](deploy/homeserver/HARDENING.md)에 있습니다.

## 개발하기

```sh
git config core.hooksPath .githooks                                # 저장소 Git 훅 연결
docker compose -f back/devInfra/docker-compose.yml up -d           # 로컬 PostgreSQL·Redis·MinIO 실행
./back/gradlew -p back bootRun                                     # 백엔드 API 실행 (http://localhost:8080)
./back/gradlew -p back exportOpenApiContract                       # 공개 API OpenAPI 계약 생성
```

로컬 실행에는 Java 25 LTS, Node.js 20 LTS, Docker가 필요합니다. 전체 품질·경계 검사는 아래 명령으로 실행합니다.

```sh
./back/gradlew -p back ktlintCheck
./back/gradlew -p back check
bash tools/guards/check-forbidden-tracked-files.sh
node tools/repo-boundary/check-platform-boundary.mjs
node tools/contracts/check-public-contracts.mjs
```

## 문제 신고

버그는 [이슈 양식](https://github.com/AquilaXk/aquila-blog/issues/new/choose)으로 신고해 주세요. 기능 요청과 PR은 받지 않습니다. 보안 문제 신고는 [SECURITY.md](SECURITY.md)에 있습니다.

## 라이선스

가져다 쓴 코드의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다. 블로그 본문과 미디어 콘텐츠([blog.aquilaxk.site](https://blog.aquilaxk.site))는 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따릅니다.

License: MIT
