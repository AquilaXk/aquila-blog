# Cloud 기능 출시 성능 기준 (초안)

> **상태**: 실측 전 placeholder. 홈서버 **외부 회선**에서 k6/curl 실행 후 수치·결정을 갱신한다.
> 관련 이슈: [#1228](https://github.com/AquilaXk/aquila-blog/issues/1228), 후속 결정 회신 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)

## 초기 목표 (실측 후 조정)

| 지표 | 초기 목표 | 측정 스크립트 | 비고 |
| --- | --- | --- | --- |
| 재생 range GET p95 (TTFB) | **< 1.5s** | `cloud-playback-load.js` → `playback_ttfb_ms` | 동시 시청 N명 부하 중 |
| 재생 에러율 | **< 1%** | `cloud-playback-load.js` → `playback_error_rate` | **416 제외**, 429는 정책에 따라 제외 가능 |
| 동시 시청 상한 | **실측으로 결정** | `CONCURRENT_VIEWERS=5→10→20` 단계 | uplink·Tunnel 상한 |
| 업로드 처리량 | **uplink × ≥ 70%** | `cloud-upload-5gb-measure.sh` → `throughputMbps` | 직렬 part 오버헤드 포함 |
| part 업로드 p95 | **< 5s** (1MiB k6 part) | `cloud-upload-parts-load.js` | API·MinIO 지연 |
| 공개 read API 간섭 | **p95 악화 < 20%** | `post-read-load.js` 병행 | baseline 대비 |

## Uplink 기준선 (placeholder)

| 항목 | 값 | 측정 방법 |
| --- | --- | --- |
| 홈서버 uplink (Mbps) | _미측정_ | speedtest/iperf 외부→홈 또는 ISP 계약값 |
| 측정 위치 | _미기록_ | k6 실행 호스트·회선 |
| 측정 일시 | _미기록_ | |

## 실행 전제

### 인증

| 시나리오 | 방식 | ENV |
| --- | --- | --- |
| 재생 | admin API로 token **사전 발급** (TTL 6h) | `CLOUD_FILE_ID`, `CLOUD_PLAYBACK_TOKEN`, `CLOUD_FILE_BYTE_SIZE` |
| 업로드 | admin 쿠키 또는 Bearer | `CLOUD_AUTH_COOKIE` 또는 `CLOUD_AUTH_HEADER` |

자격 실값은 **커밋하지 않는다**. token 만료 시 재발급 후 재실행.

### Rate limit

- `external-content` GET/HEAD에 backstop rate limit 존재.
- 측정 전: limit **일시 상향** 또는 부하를 limit **이하**로 유지.
- 결과 집계: 429 **포함 vs 제외**를 기록 (`EXCLUDE_429=1` 옵션).
- limit 방어 검증은 별도 짧은 시나리오로 분리.

### 측정 위치

- **필수**: 홈서버 외부 회선 (LAN 내부 실행 시 uplink 상한 과대평가).
- 결과 JSON/README 실행 로그에 `측정 위치`, `회선`, `일시` 기록.

## Cloudflare 약관·동시 시청 정책 (provisional)

- 모든 재생 트래픽이 **Cloudflare Tunnel(proxy)** 경유.
- [Cloudflare Application Services terms](https://www.cloudflare.com/service-specific-terms-application-services/) — 자체 호스팅 대용량·동영상 CDN 서빙 제한 가능.
- admin 전용 + 외부 token 소량 공유로 **절대 트래픽은 작음**.
- **Provisional 동시 시청 상한**: 실측 전 **동시 5명** soft cap, 실측 후 조정. 약관 리스크는 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)에 결론 회신.
- 전송 경로 크기 한도·장애 복구·정책 옵션 메뉴: [`docs/ops/cloud-transfer-limits-and-recovery.md`](../../docs/ops/cloud-transfer-limits-and-recovery.md) (#1232).

## 아키텍처 결정 (실측 후 확정)

| 결정 | 권장 default (출시) | 실측 후 | 근거 |
| --- | --- | --- | --- |
| `Cache-Control: no-store` 유지 | **유지** | _실측 후 확정_ | seek마다 MinIO 왕복 — 캐시 없으면 TTFB·uplink 부담 |
| part 업로드 **세션당 직렬** 수용 | **수용 (launch)** | _실측 후 확정_ | UPLOADING_PART 단일 claim; 5GB는 wall-clock 실측으로 세션 TTL 여유 확인 |
| CDN/R2/HLS | **Out of scope** | 별도 이슈 | 본 문서는 측정·기록만 |

### no-store 유지 판단 기준 (placeholder)

- 동시 시청 N에서 p95 TTFB 목표 충족 **且** uplink headroom 있으면 → 유지.
- 미충족 시 → [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)에서 캐시/아키텍처 이슈 분리.

### 직렬 part 수용 판단 기준 (placeholder)

- 5GB `throughputMbps ≥ uplink × 0.70` **且** 세션 만료 전 complete → **수용**.
- 미달 시 → 병렬 part 또는 아키텍처 변경을 별도 이슈.

## 결과 파일 (gitignored)

`perf/k6/results/*.json`, `*.txt`는 `.gitignore` 대상. 예상 파일명:

| 파일 패턴 | 생성 주체 |
| --- | --- |
| `cloud-playback-<timestamp>.json` | `k6 run --summary-export` |
| `cloud-upload-parts-<timestamp>.json` | k6 summary export |
| `cloud-upload-5gb-<timestamp>.json` | `cloud-upload-5gb-measure.sh` |
| `cloud-read-interference-<timestamp>/` | 병행 실행 수동 정리 |

구조 예시: `perf/k6/examples/cloud-playback.example.json`

## 검증 체크리스트

- [ ] uplink 기준선 기록
- [ ] 재생 k6 threshold 통과 (N명, seek burst)
- [ ] 5GB curl 실측 + 처리량/uplink 비율
- [ ] post-read-load 병행 간섭 < 20%
- [ ] no-store / 직렬 part / Cloudflare 정책 결정을 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)에 회신
