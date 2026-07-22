# Cloud 전송 한도·약관 리스크·장애 복구 Runbook

관련 이슈: [#1232](https://github.com/AquilaXk/aquila-blog/issues/1232), 출시 성능·정책 초안 [#1228](https://github.com/AquilaXk/aquila-blog/issues/1228) → [`perf/k6/cloud-launch-criteria.md`](../../perf/k6/cloud-launch-criteria.md), 정책 회신 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)

> 단위: Spring `DataSize` / Caddy `MB` / 본 표의 MiB는 **1 MiB = 1 048 576 bytes**. Cloudflare free plan 본문 상한은 **100 MiB**로 취급한다.

## 1. 경로별 크기 한도 (배포 정본)

| 계층 | 한도 | 설정 위치 | 비고 |
| --- | --- | --- | --- |
| Cloudflare edge (free) | 요청 본문 **100 MiB** | Cloudflare plan (고정) | 초과 시 edge **413** — origin 미도달 |
| Cloudflare Tunnel | edge와 동일 | Tunnel Public Hostname | plan 본문 한도를 따름 |
| Caddy | **100MB** (`request_body.max_size`) | `deploy/homeserver/caddy/Caddyfile` | 백엔드 전 예측 가능 413 |
| Spring multipart file | **95MB** | `spring.servlet.multipart.max-file-size` / `CUSTOM_STORAGE_MULTIPART_MAX_FILE_SIZE` | multipart 오버헤드 여유 |
| Spring multipart request | **100MB** | `spring.servlet.multipart.max-request-size` / `CUSTOM_STORAGE_MULTIPART_MAX_REQUEST_SIZE` | edge와 정렬 (구 104MB 금지) |
| 직접 업로드 (document/archive/video non-resumable) | **95 MiB** (99 614 720 B) | `custom.storage.*MaxFileSizeBytes` | 기동 가드: ≤ edge − 5 MiB |
| photo 직접 업로드 | **50 MiB** | `cloudPhotoMaxFileSizeBytes` | edge 여유 내 |
| resumable part size | 기본 **64 MiB**, 상한 **95 MiB** | `cloudVideoResumablePartSizeBytes` | part + overhead ≤ edge |
| resumable 전체 파일 | **5 GiB** | `cloudVideoResumableMaxFileSizeBytes` | part 단위 전송 — 단일 요청 한도 아님 |
| Next.js backend proxy | **100 MiB** | `BACKEND_PROXY_MAX_BODY_BYTES=104857600` | admin UI 프록시 경로 |

### 오버헤드 여유

- edge 100 MiB − multipart boundary/header 여유 **5 MiB** = 실효 payload **95 MiB**.
- 기동 가드: `CloudTransferLimits` / `CloudStorageProperties.validateAgainstEdgeTransferLimits()` (`StoragePrefixIsolationValidator`에서 호출).
- 한도 초과 설정은 **자동 보정하지 않고 fail-fast** 한다.

### 시간·만료 한도 (관련)

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 세션 sliding 연장 | 기본 24h | `cloudVideoResumableExpiresSeconds` |
| 세션 절대 상한 | 기본 7d | `cloudVideoResumableAbsoluteMaxSeconds` (#1229) |
| MinIO stale multipart | **8d** / cleanup **6h** | `MINIO_API_STALE_UPLOADS_EXPIRY` / `CLEANUP_INTERVAL` (#1226) |

상태 전이 상세: [`docs/design/cloud-multipart-state-machine.md`](../design/cloud-multipart-state-machine.md)

## 2. Cloudflare 약관·대역폭 리스크와 정책 옵션

### 리스크

- [Cloudflare Application Services / service-specific terms](https://www.cloudflare.com/service-specific-terms-application-services/)는 Stream/R2 등 자사 미디어 서비스 없이 **자체 호스팅 대용량·동영상**을 CDN으로 서빙하는 것을 제한 대상으로 둘 수 있다.
- 현재 경로: 재생·업로드가 **Cloudflare Tunnel(proxy)** 를 경유한다.
- 절대량은 admin 전용 + 외부 playback token 소량 공유로 작지만, **약관·대역폭 리스크는 0이 아니다**.

### Provisional 정책 (#1228)

출시 전 측정·정책 초안은 [`perf/k6/cloud-launch-criteria.md`](../../perf/k6/cloud-launch-criteria.md)를 정본으로 한다.

- Provisional 동시 시청 soft cap: **5명** (실측 후 조정).
- `Cache-Control: no-store` 유지 여부, 직렬 part 수용 여부는 실측 후 [#1233](https://github.com/AquilaXk/aquila-blog/issues/1233)에 회신.
- 본 runbook은 한도 정합·장애 복구만 다루며, 최종 ToS 승격 결정은 #1233 owner가 확정한다.

### 대응 옵션 (정책 메뉴)

| 옵션 | 요약 | 언제 |
| --- | --- | --- |
| A. 트래픽 상한 운영 | 동시 시청 soft cap, token TTL, rate limit 유지 | 절대 트래픽이 작은 동안 기본 |
| B. gray-cloud / 직결 서브도메인 | 미디어 전용 호스트를 proxy off 또는 직접 origin | CDN 약관 회피가 필요할 때 |
| C. R2 / Stream 이전 | Cloudflare 미디어 제품으로 이전 | 트래픽·약관 부담이 커질 때 |
| D. 기능 축소 | 외부 공유 비활성, admin-only 재생 | 긴급 완화 |

## 3. 장애 복구 Runbook

전제: 홈서버에서 `docker compose` 프로젝트 디렉터리(`deploy/homeserver`), MinIO alias(`mc`), DB(`psql`), admin API 쿠키/Bearer를 사용할 수 있다. secret·token 원문은 기록하지 않는다.

### 3.1 증상 → 첫 확인

| 증상 | 먼저 확인할 것 |
| --- | --- |
| 업로드 직후 413 | edge/Caddy 한도 — origin 로그에 요청이 없으면 edge/Caddy |
| 업로드 중 409 / 고착 | `cloud_video_upload_session.status` stale 중간상태 |
| complete 후 파일 없음 | COMPLETING + HeadObject 커밋 판정 / `cloud_file` 누락 |
| 재생 401/410 | playback token 만료·삭제, file soft-delete |
| MinIO 용량 이상 | incomplete multipart (`mc ls --incomplete`) |

### 3.2 고착 업로드 세션 수동 정리

```bash
# 1) 세션 상태 확인 (SESSION_ID 치환)
docker compose exec -T db psql -U postgres -d blog -c \
  "SELECT id, status, upload_id, object_key, byte_size, expires_at, failure_reason, updated_at
   FROM cloud_video_upload_session WHERE id = :SESSION_ID;"

# 2) 가능하면 cancel API (admin 인증 필요)
curl -sS -X DELETE \
  -H "Cookie: ${ADMIN_COOKIE}" \
  "https://${API_DOMAIN}/system/api/v1/adm/cloud/files/video-upload-sessions/${SESSION_ID}"

# 3) API 불가·scheduler 정지 시: 상태만 기록 후 remote abort (임의 IN_PROGRESS 되돌리기 금지)
docker compose exec -T minio mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker compose exec -T minio mc ls --incomplete local/blog-images
# uploadId/objectKey가 보이면 incomplete 제거 (아래 3.3)
```

자동 회수: `purgeStaleIntermediateSessions` / `CloudVideoUploadSessionCleanupScheduledJob`. COMPLETING은 HeadObject 커밋 승계 후 abort 금지 — 설계 문서 참고.

### 3.3 MinIO 잔여 multipart 정리

```bash
docker compose exec -T minio mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker compose exec -T minio mc ls --incomplete local/${CUSTOM_STORAGE_BUCKET:-blog-images}
# 특정 객체 incomplete 제거
docker compose exec -T minio mc rm --incomplete --force \
  "local/${CUSTOM_STORAGE_BUCKET:-blog-images}/${OBJECT_KEY}"

# stale_uploads 운영값 확인 (#1226)
docker compose exec -T minio sh -c 'echo EXPIRY=$MINIO_API_STALE_UPLOADS_EXPIRY INTERVAL=$MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL'
# 기대: EXPIRY=8d INTERVAL=6h
```

### 3.4 Playback token 즉시 무효화

공개 revoke API가 없으면 **행 삭제**로 즉시 무효화한다.

```bash
# token 해시/원문 대신 file_id 또는 token id로 삭제
docker compose exec -T db psql -U postgres -d blog -c \
  "SELECT id, cloud_file_id, purpose, expires_at, create_date
   FROM cloud_external_playback_token
   WHERE cloud_file_id = :FILE_ID
   ORDER BY id DESC LIMIT 20;"

docker compose exec -T db psql -U postgres -d blog -c \
  "DELETE FROM cloud_external_playback_token WHERE id = :TOKEN_ID;"
# 또는 해당 파일의 모든 외부 token:
# DELETE FROM cloud_external_playback_token WHERE cloud_file_id = :FILE_ID;
```

만료 일괄 정리는 `CloudExternalPlaybackTokenCleanupScheduledJob`가 수행한다.

### 3.5 재생 실패 (객체/메타 불일치)

```bash
# cloud_file 메타
docker compose exec -T db psql -U postgres -d blog -c \
  "SELECT id, object_key, byte_size, content_type, deleted, create_date
   FROM cloud_file WHERE id = :FILE_ID;"

# 객체 존재
docker compose exec -T minio mc stat \
  "local/${CUSTOM_STORAGE_BUCKET:-blog-images}/${OBJECT_KEY}"
```

- 메타 O / 객체 X → reconcile dry-run 메트릭 확인 후, repair 플래그는 **안전 임계값** 확인 뒤에만.
- 객체 O / 메타 X → orphan 객체; grace·진행 중 session `object_key` 제외 여부 확인.

### 3.6 리허설 체크리스트 (홈서버)

- [ ] 95 MiB 직접 업로드 성공, 100 MiB+ 요청이 edge 또는 Caddy에서 413
- [ ] 고착 세션: SQL 확인 → cancel API → `mc ls --incomplete` 잔여 없음
- [ ] `mc rm --incomplete`로 고의 incomplete 제거 리허설
- [ ] playback token DELETE 후 external-content 401/410
- [ ] `MINIO_API_STALE_UPLOADS_EXPIRY=8d` 확인

## 4. 변경 시 주의

- edge보다 큰 `max-request-size` / Caddy `max_size` / part·직접 업로드 한도를 올리지 않는다.
- Cloudflare plan 변경(200/500MB) 시 본 표·`CloudTransferLimits`·Caddy·Spring·env example을 **같은 커밋**에서 갱신한다.
- #1231 관측(대시보드)과 본 문서는 분리한다 — 메트릭 패널은 별도 이슈.
