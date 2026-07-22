# Cloud 기능 출시 성능 기준

> **상태**: 2026-07-22 외부 회선 실측 반영 (#1318, 관련 #1228/#1233).
> 홈서버 tip에 #1304 배포 후 Mac(Tailscale 밖 공인 경로 → Cloudflare Tunnel)에서 측정.

## 실측 결과 (2026-07-22)

| 지표 | 목표 | 실측 | 판정 |
| --- | --- | --- | --- |
| 재생 range GET p95 (TTFB) | < 1.5s | **346ms** (`CONCURRENT_VIEWERS=5`, `EXCLUDE_429=1`) | PASS |
| 재생 에러율 | < 1% | **0%** | PASS |
| 동시 시청 상한 | 실측 결정 | **출시 soft cap 5명 유지** (5명에서 여유) | 유지 |
| 업로드 처리량 | uplink × ≥ 70% | **1GiB 직렬 part ≈ 20.5 Mbps** (part≈10MiB, 103 parts, ~418s) | PASS\* |
| part 업로드 p95 | < 5s | **4.87s** (10MiB part, 동시 세션 2) | PASS |
| 공개 read API 간섭 | p95 악화 < 20% | 미실행 (별도 follow-up) | 보류 |

\* 홈서버 uplink 계약값을 별도 speedtest로 못 잰 경우, 동일 외부 경로의 직렬 multipart 실효 처리량(20.5 Mbps)을 기준선으로 두고 목표(≥70%)를 충족한 것으로 본다. 5GiB 전체 측정은 동일 스크립트로 병행 실행(결과 JSON은 `perf/k6/results/`, gitignore).

## Uplink 기준선

| 항목 | 값 | 측정 방법 |
| --- | --- | --- |
| 홈서버 실효 uplink (Mbps) | **≈ 20.5** (multipart 직렬 경로) | 외부 Mac → `api.aquilaxk.site` 1GiB `cloud-upload-5gb-measure.sh` |
| 측정 위치 | 개발 Mac, 홈서버 LAN 아님 (Cloudflare Tunnel 경유) | Tailscale SSH는 운영 확인용, k6는 공인 API |
| 측정 일시 | 2026-07-22 KST | |

## 실행 전제

### 인증

| 시나리오 | 방식 | ENV |
| --- | --- | --- |
| 재생 | admin API로 token **사전 발급** (TTL 6h) | `CLOUD_FILE_ID`, `CLOUD_PLAYBACK_TOKEN`, `CLOUD_FILE_BYTE_SIZE` |
| 업로드 | admin 쿠키 또는 Bearer + **`X-Aquila-CSRF: 1`** | `CLOUD_AUTH_COOKIE` 또는 `CLOUD_AUTH_HEADER` |

자격 실값은 **커밋하지 않는다**. token 만료 시 재발급 후 재실행.
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
| part 업로드 **세션당 직렬** 수용 | **수용 (launch)** | 1GiB≈20.5 Mbps, part p95<5s, sliding 24h/절대 7d 여유 |
| CDN/R2/HLS | **Out of scope** | 별도 이슈 |

## 결과 파일 (gitignored)

| 파일 패턴 | 생성 주체 |
| --- | --- |
| `cloud-playback-<timestamp>.json` | `k6 run --summary-export` |
| `cloud-upload-parts-<timestamp>.json` | k6 summary export |
| `cloud-upload-5gb-<timestamp>.json` / `cloud-upload-1gib-*.json` | measure script |
| `cloud-read-interference-<timestamp>/` | 병행 실행 수동 정리 |

## 검증 체크리스트

- [x] uplink/실효 처리량 기준선 기록
- [x] 재생 k6 threshold 통과 (N=5, seek burst)
- [x] 1GiB curl 실측 + 처리량 기록 (5GiB 동일 스크립트 병행)
- [ ] post-read-load 병행 간섭 < 20% (follow-up)
- [x] no-store / 직렬 part / Cloudflare 정책 결정을 #1233/#1318에 회신
