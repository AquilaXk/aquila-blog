# k6 Load Test Guide

## 1) Post read mix (상용 블로그 가정 시나리오)

```bash
k6 run perf/k6/post-read-load.js
```

- 기본 대상: `https://api.aquilaxk.site`
- 시나리오 구성:
  - `home_feed`: 메인 피드/태그 조회
  - `detail_reader`: 글 상세 조회
  - `explore_search`: 검색/태그 탐색
- 기본 부하(총합): 피크 약 **27 req/s** (6분)
- 데이터 건수:
  - 목록: `pageSize 12/18/24` 랜덤
  - 상세: setup에서 수집한 최신 글 id 풀(최대 30개) 랜덤 접근
  - 탐색: keyword + tag 랜덤 조합
- 다른 환경 대상:

```bash
BASE_URL="https://staging-api.example.com" k6 run perf/k6/post-read-load.js
```

현재 스크립트는 scenario별 stage를 코드에 고정한 형태라, 부하 강도 조정 시 stage 값을 직접 수정하는 방식을 권장합니다.

## 1-1) Chaos smoke (장애 주입 시 read 경로 회복력 점검)

```bash
k6 run perf/k6/post-read-chaos-smoke.js
```

- 기본 대상: `https://api.aquilaxk.site`
- 핵심 검증:
  - `feed/explore/detail` 2xx/3xx 성공률
  - 경로별 p95(`feed/explore<2.5s`, `detail<1.8s`)
- 선택 장애 주입:

```bash
BASE_URL="https://api.aquilaxk.site" \
CHAOS_FAILURE_PATH="/post/api/v1/posts/feed?page=99999&pageSize=1000" \
k6 run perf/k6/post-read-chaos-smoke.js
```

- `CHAOS_FAILURE_PATH`는 일부러 실패를 유도할 경로를 지정하고, 주 read 경로 성공률이 유지되는지 확인합니다.

## 1-2) Chaos suite 자동 실행(실무 운영형)

```bash
./perf/k6/run-chaos-suite.sh
```

- 실행 항목:
  - `baseline` (장애 미주입)
  - `chaos_1..N` (실패 유도 경로 순차 주입)
  - `chaos_redis_disconnect` (Redis 단절 주입)
  - `chaos_db_delay` (DB 지연/단절 주입)
  - `chaos_api_5xx_burst` (API 컨테이너 단절 기반 5xx burst 주입)
- 결과:
  - `perf/k6/results/chaos-<timestamp>/report.txt`
  - 케이스별 `*.summary.json`, `*.log`
- 판정 기준:
  - `successRate>=0.95`
  - `feed/explore/detail` p95 임계치 충족

옵션 예시:

```bash
BASE_URL="https://api.aquilaxk.site" \
DETAIL_ID="503" \
CHAOS_FAILURE_PATHS="/post/api/v1/posts/999999999,/post/api/v1/posts/feed?page=99999&pageSize=1000" \
./perf/k6/run-chaos-suite.sh
```

기본 주입 방식:

- Redis/DB는 `docker pause/unpause`로 짧게 단절시켜 복원력을 확인합니다.
- 컨테이너명이 자동 탐지되지 않으면 `CHAOS_REDIS_CONTAINER`, `CHAOS_DB_CONTAINER`로 명시할 수 있습니다.

운영 주입 명령 커스터마이징(권장):

```bash
CHAOS_REDIS_INJECT_CMD="docker pause blog_home-redis_1-1" \
CHAOS_REDIS_RECOVER_CMD="docker unpause blog_home-redis_1-1" \
CHAOS_DB_INJECT_CMD="docker pause blog_home-db_1-1" \
CHAOS_DB_RECOVER_CMD="docker unpause blog_home-db_1-1" \
./perf/k6/run-chaos-suite.sh
```

5xx burst 주입 대상을 명시해야 할 때:

```bash
CHAOS_API_CONTAINER="blog_home-back_blue-1" \
CHAOS_API_PAUSE_SECONDS=10 \
./perf/k6/run-chaos-suite.sh
```

## 2) 확인할 핵심 지표

- `post_feed_duration_ms` p95
- `post_explore_duration_ms` p95
- `post_detail_duration_ms` p95
- `post_tags_duration_ms` p95
- `http_req_failed` rate
- `post_business_error_rate` rate
- `post_server_error_rate` rate

## 3) Prometheus/Grafana에서 보는 쿼리 예시

```promql
histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{uri="/post/api/v1/posts/feed",method="GET"}[5m])) by (le))
```

```promql
histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{uri="/post/api/v1/posts/explore",method="GET"}[5m])) by (le))
```

```promql
histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{uri="/post/api/v1/posts/{id}",method="GET"}[5m])) by (le))
```

```promql
sum(rate(http_server_requests_seconds_count{uri=~"/post/api/v1/posts/(feed|explore|\\{id\\})",status=~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count{uri=~"/post/api/v1/posts/(feed|explore|\\{id\\})"}[5m]))
```

## 4) 운영 기준(권장)

- read API p95: feed/explore 2.5s 이하, detail 1.8s 이하
- read API 5xx rate 1% 미만
- 급격한 p95 상승 시 최근 배포/DB 부하/캐시 적중률을 함께 확인

## 5) Cloud 재생·업로드 (#1228)

출시 기준 초안: [`cloud-launch-criteria.md`](./cloud-launch-criteria.md)

### 5-1) External playback (동시 시청 + seek)

사전 준비: admin API로 외부 재생 token 발급 (TTL 6h). 자격은 **커밋하지 않고** `__ENV`로 주입.

```bash
BASE_URL="https://api.aquilaxk.site" \
CLOUD_FILE_ID="103" \
CLOUD_PLAYBACK_TOKEN="<token-from-admin-api>" \
CLOUD_FILE_BYTE_SIZE="8388608" \
CONCURRENT_VIEWERS="5" \
k6 run perf/k6/cloud-playback-load.js
```

- 시나리오: `concurrent_viewers`(constant-vus) + `seek_burst`(ramping-vus)
- 패턴: HEAD → 초기 range(moov) → 무작위 offset range (플레이어 seek 흉내)
- threshold: `playback_ttfb_ms` p95 < 1.5s, `playback_error_rate` < 1% (**416 제외**)
- rate limit: `external-content`에 429 backstop — 측정 전 limit 조건 기록. `EXCLUDE_429=1`로 429 제외 집계 가능
- **측정 위치**: 홈서버 외부 회선 (LAN 실행 금지 — uplink 상한 과대평가)

결과 export 예:

```bash
k6 run --summary-export "perf/k6/results/cloud-playback-$(date +%Y%m%d-%H%M%S).json" \
  perf/k6/cloud-playback-load.js
```

구조 예시: [`examples/cloud-playback.example.json`](./examples/cloud-playback.example.json)

### 5-2) Multipart part upload (k6 — API 지연·동시 세션)

Admin 인증: `CLOUD_AUTH_COOKIE="accessToken=..."` 또는 `CLOUD_AUTH_HEADER="Bearer ..."`

```bash
BASE_URL="https://api.aquilaxk.site" \
CLOUD_AUTH_COOKIE="accessToken=..." \
PART_SIZE_BYTES="1048576" \
PARTS_PER_SESSION="3" \
CONCURRENT_SESSIONS="2" \
k6 run perf/k6/cloud-upload-parts-load.js
```

- k6는 part body를 메모리에 유지 → `PART_SIZE_BYTES`는 작게(기본 1MiB)
- 세션당 part는 **직렬** 업로드(현재 백엔드 구조). VU마다 별도 세션으로 동시성 측정
- complete 대신 cancel로 종료(스토리지 잔여 최소화)

### 5-3) 5GB 전체 업로드 실측 (curl)

```bash
chmod +x perf/k6/cloud-upload-5gb-measure.sh
BASE_URL="https://api.aquilaxk.site" \
CLOUD_AUTH_COOKIE="accessToken=..." \
TARGET_GIB="5" \
./perf/k6/cloud-upload-5gb-measure.sh
```

- `perf/k6/results/cloud-upload-5gb-<timestamp>.json`에 처리량·part 지연 요약
- uplink 대비 ≥ 70% 목표는 `cloud-launch-criteria.md` 참고

### 5-4) 공개 read API 간섭 (post-read-load 병행)

별도 스크립트 없이 **두 터미널**에서 동시 실행:

```bash
# 터미널 A — baseline 또는 부하 중 read API
BASE_URL="https://api.aquilaxk.site" \
k6 run --summary-export "perf/k6/results/read-under-cloud-$(date +%Y%m%d-%H%M%S).json" \
  perf/k6/post-read-load.js

# 터미널 B — cloud 재생 또는 업로드 부하
BASE_URL="https://api.aquilaxk.site" \
CLOUD_FILE_ID="103" CLOUD_PLAYBACK_TOKEN="..." CLOUD_FILE_BYTE_SIZE="8388608" \
k6 run perf/k6/cloud-playback-load.js
```

판정: baseline `post-read-load` summary와 부하 중 summary의 feed/explore/detail p95를 비교 — **악화 20% 미만** (`cloud-launch-criteria.md`).

### 5-5) results 디렉터리

- `perf/k6/results/*.json`, `*.txt`는 `.gitignore` 대상 (live 자격·측정값 유출 방지)
- 예상 파일명·메트릭: `cloud-launch-criteria.md` 및 `examples/` 참고
