# Cloud 기능 출시 성능 기준

> **상태**: 2026-07-22 외부 회선 실측 반영 (#1318, 관련 #1228/#1233).
> 홈서버 tip에 #1304 배포 후 Mac(Tailscale 밖 공인 경로 → Cloudflare Tunnel)에서 측정.

## 실측 결과 (2026-07-22)

| 지표 | 목표 | 실측 | 판정 |
| --- | --- | --- | --- |
| 재생 range GET p95 (TTFB) | < 1.5s | **346ms** (`CONCURRENT_VIEWERS=5`, `EXCLUDE_429=1`) | PASS |
| 재생 에러율 | < 1% | **0%** | PASS |
| 동시 시청 상한 | 실측 결정 | **출시 soft cap 5명 유지** (5명에서 여유) | 유지 |
| 업로드 처리량 | 독립 uplink × ≥ 70% | 제품경로 **≈ 20.5–20.7 Mbps** (1GiB·5GiB 직렬 part) / 독립 uplink **≈ 250–297 Mbps** → **≈ 7–8%** | **FAIL\*** |
| part 업로드 p95 | < 5s | **4.87s** (10MiB part, 동시 세션 2); 5GiB wall part p95 **5001ms** | PASS |
| 공개 read API 간섭 | p95 악화 < 20% | feed p95 341→317ms (−7%), detail 362→328ms (−9%); **server_error 0%→6.37%** | **조건부\*\*** |
| 5GiB wall-clock | 완주·처리량 기록 | **5.0 GiB / 512×10MiB / 2074s / 20.709 Mbps** (`SKIP_COMPLETE`) | 기록 |

\* 독립 기준선(Mac `networkQuality` uplink ≈ **249.9 Mbps**, Mac→`speed.cloudflare.com/__up` ≈ **296.9 Mbps**, 홈서버→동일 CF __up ≈ **277 Mbps**)과 제품 경로(Mac→`api.aquilaxk.site` multipart)를 분리했다. 동일 multipart 값을 uplink와 결과로 이중 사용하지 않는다. ≥70% 목표는 **미달**이며, 병목은 client/홈서버 일반 인터넷 uplink가 아니라 **Tunnel·API·MinIO 제품 경로**로 본다. 출시는 직렬 part + soft cap 5를 유지하고, 처리량 개선은 follow-up.

\*\* p95 악화 목표는 충족했으나, playback N=5 병행 시 `post_server_error_rate`가 0%→6.37%로 악화(max spike ~16s). 출시 soft cap 유지 + 대용량 업로드와 공개 read 부하를 동시에 걸지 않는 운영 메모로 수용. check/business_error 실패율(~88–93%)은 경로/응답 계약 불일치로 duration 판정과 분리해 기록.

## Uplink 기준선 (독립)

| 항목 | 값 | 측정 방법 |
| --- | --- | --- |
| Mac 일반 uplink | **≈ 249.9 Mbps** | `networkQuality` `ul_throughput` (2026-07-22) |
| Mac → Cloudflare speed | **≈ 296.9 Mbps** | `POST https://speed.cloudflare.com/__up` 20MiB |
| 홈서버 → Cloudflare speed | **≈ 277 Mbps** | 동일 CF __up 20MiB (SSH) |
| 제품 경로 실효 처리량 | **≈ 20.5 Mbps** (1GiB), **20.709 Mbps** (5GiB) | 외부 Mac → `api.aquilaxk.site` `cloud-upload-5gb-measure.sh` |
| 측정 위치 | 개발 Mac / 홈서버 각각 (Cloudflare Tunnel 경유 제품경로) | Tailscale SSH는 운영 확인용, k6는 공인 API |
| 측정 일시 | 2026-07-22 KST | |

## 공개 read 간섭 (playback N=5 병행)

| 지표 | Baseline (단독 ~6m) | Interference (playback N=5) | 변화 |
| --- | --- | --- | --- |
| `post_feed_duration_ms` p95 | 340.9 ms | 317.5 ms | −6.9% |
| `post_detail_duration_ms` p95 | 361.6 ms | 327.7 ms | −9.4% |
| `post_server_error_rate` | 0.00% | **6.37%** | 악화 |
| `http_req_duration` p95 | 354 ms | 329 ms | −7% |
| max `http_req_duration` | 1.01 s | **16.43 s** | spike |

로그: `perf/k6/results/cloud-read-baseline-20260722-160148.log`, `cloud-read-interfere-20260722-161355.log` (gitignore).

## 실행 전제

### 인증

| 시나리오 | 방식 | ENV |
| --- | --- | --- |
| 재생 | admin API로 token **사전 발급** (TTL 6h) | `CLOUD_FILE_ID`, `CLOUD_PLAYBACK_TOKEN`, `CLOUD_FILE_BYTE_SIZE` |
| 업로드 | admin 쿠키 또는 Bearer + **`X-Aquila-CSRF: 1`** | `CLOUD_AUTH_COOKIE` / `CLOUD_AUTH_HEADER` / `CLOUD_AUTH_COOKIE_FILE` |

자격 실값은 **커밋하지 않는다**. accessToken TTL≈20m — 장시간(5GiB) 측정은 `CLOUD_AUTH_COOKIE_FILE`을 part마다 재읽고, 외부에서 주기 재로그인한다.
첫 part는 ISO BMFF `ftyp` 시그니처가 필요하다(스크립트가 자동 삽입).

### Rate limit

- `external-content` GET/HEAD에 backstop rate limit 존재.
- 본 실측: `EXCLUDE_429=1`, 부하를 limit 이하로 유지.
- limit 방어 검증은 별도 짧은 시나리오로 분리.

### 측정 위치

- **필수**: 홈서버 외부 회선 (LAN 내부 실행 시 uplink 상한 과대평가).
- 결과 JSON은 `perf/k6/results/`(gitignore).

## Cloudflare 약관·동시 시청 정책

- 모든 재생·업로드가 **Cloudflare Tunnel(proxy)** 경유.
- Provisional 동시 시청 soft cap: **5명** (실측 후 유지).
- 약관 리스크는 0이 아니나, admin 전용 + 외부 token 소량 공유로 절대량은 작음 → 출시 기본 **옵션 A(트래픽 상한 운영)** 유지. 회신은 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)/#1318.

## 아키텍처 결정 (실측 후)

| 결정 | 출시 결정 | 근거 |
| --- | --- | --- |
| `Cache-Control: no-store` 유지 | **유지** | 5명 동시에서 p95 TTFB 346ms로 목표 충족 |
| part 업로드 **세션당 직렬** 수용 | **수용 (launch)** | part p95<5s, sliding 24h/절대 7d 여유. 제품경로 ≈20.5 Mbps는 독립 uplink 대비 낮으나 launch blocker로 보지 않음 |
| CDN/R2/HLS | **Out of scope** | 별도 이슈 |
| 업로드×공개 read 동시 부하 | **운영 회피** | 간섭 시 5xx 6.37% 관측 |

## 결과 파일 (gitignored)

| 파일 패턴 | 생성 주체 |
| --- | --- |
| `cloud-playback-<timestamp>.json` | `k6 run --summary-export` |
| `cloud-upload-parts-<timestamp>.json` | k6 summary export |
| `cloud-upload-5gb-<timestamp>.json` / `cloud-upload-1gib-*.json` | measure script |
| `cloud-read-baseline-*.log` / `cloud-read-interfere-*.log` | post-read-load 병행 |
| `uplink-networkQuality.txt` / `uplink-mac-cf.txt` | 독립 uplink |

## 검증 체크리스트

- [x] 독립 uplink 기준선 기록 (NQ + CF __up; 제품경로와 분리)
- [x] 재생 k6 threshold 통과 (N=5, seek burst)
- [x] 1GiB curl 실측 + 처리량 기록
- [x] 5GiB wall-clock 완주 기록 (2074s, 20.709 Mbps, cookie file 재로그인)
- [x] post-read-load 병행 간섭 기록 (p95 OK / 5xx 악화 조건부)
- [x] no-store / 직렬 part / Cloudflare 정책 결정을 #1233/#1318에 회신
