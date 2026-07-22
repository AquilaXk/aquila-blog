# Cloud media metrics — post-deploy verification

이 문서는 홈서버 반영 후 메트릭·대시보드·알람을 **실제로** 확인하는 절차다.
스크린샷은 배포 후 운영자가 캡처한다(사전 날조 금지).

## 전제

- `main` merge 후 homeserver CD가 새 back 이미지와 `deploy/homeserver/monitoring/**`를 반영했다.
- Prometheus rule_files에 `rules/*.yml`이 마운트되어 있다(`cloud-media-alerts.yml` 포함).
- Grafana dashboards provisioning 경로에 `blog-cloud-media.json`이 있다.

## 1) Prometheus 메트릭 scrape

```bash
# back actuator (component 라벨은 scrape target에 따라 다름)
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=cloud_upload_session_transitions_total' | jq '.data.result | length'
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=cloud_playback_requests_total' | jq '.data.result | length'
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=cloud_upload_session_stuck' | jq .
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=cloud_disk_temp_avail_bytes' | jq .
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=aquila_host_filesystem_avail_bytes{mount="minio"}' | jq .
curl -fsS 'http://127.0.0.1:9090/api/v1/query?query=cloud_reconcile_orphans' | jq .
```

기대: 배포 직후에도 gauge류(`stuck`, `temp`, `minio`, `orphans`)는 값이 보이고, counter류는 트래픽 후 증가한다.

## 2) Grafana 대시보드

1. Grafana → folder `Aquila` → dashboard `Blog Cloud Media` (`uid=blog-cloud-media`)
2. 패널 확인: Playback RED, Upload funnel, Stuck sessions, Reconcile orphans, Temp/MinIO disk
3. 배포 후 스크린샷을 issue `#1231` 또는 운영 노트에 첨부

## 3) Alertmanager 룰 로드

```bash
curl -fsS http://127.0.0.1:9090/api/v1/rules | jq '.data.groups[] | select(.name=="aquila-cloud-media") | {name, rules:[.rules[].name]}'
```

기대 룰 이름:

- `AquilaCloudUploadFailureRateWarning` / `Critical`
- `AquilaCloudUploadSessionStuck`
- `AquilaCloudPlayback5xxHigh`
- `AquilaCloudTempDiskLowWarning` / `Critical`
- `AquilaCloudMinioDiskLowWarning` / `Critical`
- `AquilaCloudReconcileOrphansDetected` / `Spike`

## 4) 알람 발화 스모크(선택)

운영 영향이 없는 환경에서만 수행:

1. Prometheus UI → Graph에서 warning expr를 temporarily evaluate
2. 또는 staging에서 실패 업로드를 인위적으로 유발한 뒤 `ALERTS{alertname=~"AquilaCloud.*"}` 확인
3. 로컬/CI에서는 `promtool check rules deploy/homeserver/monitoring/rules/cloud-media-alerts.yml`로 문법 검증

## 5) 배포 상태

홈서버 배포 스크립트/헬스 체크(`check_deploy_status.sh` 등)가 PASS인지 확인한 뒤, 위 1–3을 같은 환경에서 재실행한다.
