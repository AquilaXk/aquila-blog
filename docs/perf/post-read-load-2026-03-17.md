# Post Read 부하 테스트 리포트 (2026-03-17)

## 1) 테스트 목표

- 상용 블로그 읽기 트래픽(메인/상세/탐색)에서 병목 구간을 수치로 특정
- 병목 완화 패치 적용 후 동일 시나리오로 재측정하여 Before/After 비교

## 2) 시나리오

- 스크립트: `perf/k6/post-read-load.js`
- 대상: `https://api.aquilaxk.site`
- 구성:
  - `home_feed` (메인 피드 + 일부 태그 조회)
  - `detail_reader` (상세 조회)
  - `explore_search` (검색/태그 탐색)
- 피크 부하: 약 27 req/s
- 총 실행 시간: 6분 + graceful stop

## 3) 1차 측정(Before, 라이브)

실행 시각: 2026-03-17 21:00 KST  
결과 파일:
- `perf/k6/results/baseline-live.txt`
- `perf/k6/results/baseline-live.json`

핵심 수치:

| 항목 | p95 | avg | 비고 |
|---|---:|---:|---|
| `post_feed_duration_ms` | 2487ms | 1070ms | 목표(2500ms) 경계 근접 |
| `post_explore_duration_ms` | 2408ms | 1055ms | 목표(2500ms) 경계 근접 |
| `post_detail_duration_ms` | 4953ms | 1698ms | 목표(1800ms) 초과 |
| `post_tags_duration_ms` | 2273ms | 979ms | 목표(1000ms) 초과 |
| `http_req_duration` | 3429ms | 1329ms | 읽기 전체 체감 지연 큼 |
| `http_req_failed` | 0.015% | - | 오류율 자체는 낮음 |

추가 관측:
- `detail`/`tags`에서 긴 tail latency가 집중적으로 발생
- max 값이 매우 큰 outlier(수십 초) 구간이 존재

## 4) 병목 원인 후보와 의사결정

### 후보 A: DB 쿼리/파싱 자체 최적화(쿼리 재설계, 집계 테이블)
- 장점: 근본 개선 가능
- 단점: 구현 범위/리스크 큼, 즉시 적용 난이도 높음

### 후보 B: 읽기 경로 캐시 강화(짧은 TTL + 쓰기 시 무효화)
- 장점: 즉시 효과, 코드 변경 범위 작음, 운영 리스크 낮음
- 단점: 짧은 TTL 내 eventual consistency 허용 필요

### 선택
- **후보 B 채택**
- 이유:
  - 현재 병목이 읽기 hot-path 집중(`detail`, `tags`)
  - 블로그 트래픽 특성상 read-heavy
  - 짧은 TTL(10~15초)과 쓰기 이벤트 시 캐시 clear로 UX/정합성 균형 가능

## 5) 적용한 패치

### 코드
- `PostPublicReadQueryService` 추가
  - 익명 상세 조회 캐시: `post-detail-public-v1`
  - 태그 집계 캐시: `post-tags-v1`
- `ApiV1PostController`
  - 익명 상세는 캐시 경로 사용
  - `/tags` 응답은 캐시 서비스 경유
- `PostApplicationService`
  - 쓰기/수정/삭제/복구 시 read 캐시 무효화 범위 확장
  - 무효화 대상: `feed/explore/tags/detail-public`
- `application.yaml`
  - TTL override 추가:
    - `post-tags-v1` (기본 12초)
    - `post-detail-public-v1` (기본 15초)

## 6) 2차 측정(After) 계획

배포 후 동일 스크립트로 재실행:

```bash
k6 run perf/k6/post-read-load.js --summary-export perf/k6/results/after-live.json > perf/k6/results/after-live.txt
```

비교 기준:
- `post_detail_duration_ms` p95: **4953ms → 목표 1800ms 이하**
- `post_tags_duration_ms` p95: **2273ms → 목표 1000ms 이하**
- `http_req_duration` p95: **3429ms → 2500ms 이하**
- 오류율(`http_req_failed`, `post_server_error_rate`) 악화 금지

## 7) 운영 체크 포인트

- Grafana:
  - `/post/api/v1/posts/{id}`
  - `/post/api/v1/posts/tags`
  - `/post/api/v1/posts/feed`, `/explore`
- Redis cache hit/miss와 eviction 로그
- 배포 직후 30분 구간 p95/p99 급등 여부

