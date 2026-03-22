#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6_BIN="${K6_BIN:-k6}"
BASE_URL="${BASE_URL:-https://api.aquilaxk.site}"
DETAIL_ID="${DETAIL_ID:-503}"
OUT_DIR="${OUT_DIR:-$SCRIPT_DIR/results/chaos-$(date +%Y%m%d-%H%M%S)}"
CHAOS_FAILURE_PATHS="${CHAOS_FAILURE_PATHS:-/post/api/v1/posts/feed?page=99999&pageSize=1000,/post/api/v1/posts/explore?page=99999&pageSize=1000&sort=CREATED_AT&kw=&tag=,/post/api/v1/posts/999999999}"
CHAOS_INJECT_START_DELAY_SECONDS="${CHAOS_INJECT_START_DELAY_SECONDS:-12}"
CHAOS_REDIS_PAUSE_SECONDS="${CHAOS_REDIS_PAUSE_SECONDS:-18}"
CHAOS_DB_PAUSE_SECONDS="${CHAOS_DB_PAUSE_SECONDS:-18}"
CHAOS_API_PAUSE_SECONDS="${CHAOS_API_PAUSE_SECONDS:-10}"
CHAOS_REDIS_CONTAINER="${CHAOS_REDIS_CONTAINER:-}"
CHAOS_DB_CONTAINER="${CHAOS_DB_CONTAINER:-}"
CHAOS_API_CONTAINER="${CHAOS_API_CONTAINER:-}"
CHAOS_REDIS_INJECT_CMD="${CHAOS_REDIS_INJECT_CMD:-}"
CHAOS_REDIS_RECOVER_CMD="${CHAOS_REDIS_RECOVER_CMD:-}"
CHAOS_DB_INJECT_CMD="${CHAOS_DB_INJECT_CMD:-}"
CHAOS_DB_RECOVER_CMD="${CHAOS_DB_RECOVER_CMD:-}"
CHAOS_API_INJECT_CMD="${CHAOS_API_INJECT_CMD:-}"
CHAOS_API_RECOVER_CMD="${CHAOS_API_RECOVER_CMD:-}"

mkdir -p "$OUT_DIR"

if ! command -v "$K6_BIN" >/dev/null 2>&1; then
  echo "[ERR] k6 실행 파일을 찾지 못했습니다. K6_BIN 또는 PATH를 확인하세요." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERR] node 실행 파일을 찾지 못했습니다." >&2
  exit 1
fi

suite_failed=0
report_file="$OUT_DIR/report.txt"
touch "$report_file"

docker_available=1
if ! command -v docker >/dev/null 2>&1; then
  docker_available=0
  echo "[WARN] docker 실행 파일이 없어 Redis/DB 장애 주입 케이스를 건너뜁니다." | tee -a "$report_file"
fi

SUMMARY_SCRIPT="$SCRIPT_DIR/summarize-chaos-result.mjs"
K6_SCRIPT="$SCRIPT_DIR/post-read-chaos-smoke.js"

run_case() {
  local case_name="$1"
  local chaos_failure_path="$2"
  local summary_json="$OUT_DIR/${case_name}.summary.json"
  local raw_log="$OUT_DIR/${case_name}.log"
  local case_failed=0

  echo "=== running case: $case_name" | tee -a "$report_file"

  if ! BASE_URL="$BASE_URL" DETAIL_ID="$DETAIL_ID" CHAOS_FAILURE_PATH="$chaos_failure_path" \
    "$K6_BIN" run "$K6_SCRIPT" --summary-export "$summary_json" >"$raw_log" 2>&1; then
    case_failed=1
  fi

  if ! node "$SUMMARY_SCRIPT" "$summary_json" "$case_name" | tee -a "$report_file"; then
    case_failed=1
  fi

  if [[ $case_failed -ne 0 ]]; then
    suite_failed=1
  fi
}

resolve_container_name() {
  local explicit_name="$1"
  local pattern="$2"
  if [[ -n "$explicit_name" ]]; then
    echo "$explicit_name"
    return 0
  fi

  docker ps --format '{{.Names}}' | grep -E "$pattern" | head -n1 || true
}

run_with_pause_injection() {
  local case_name="$1"
  local chaos_failure_path="$2"
  local container_name="$3"
  local pause_seconds="$4"
  local start_delay="$5"
  local phase_label="$6"

  if [[ -z "$container_name" ]]; then
    echo "[WARN] $phase_label 대상 컨테이너를 찾지 못해 케이스를 건너뜁니다." | tee -a "$report_file"
    return 0
  fi

  (
    sleep "$start_delay"
    echo "[inject] $phase_label pause start container=$container_name seconds=$pause_seconds" | tee -a "$report_file"
    docker pause "$container_name" >/dev/null
    sleep "$pause_seconds"
    docker unpause "$container_name" >/dev/null
    echo "[inject] $phase_label pause end container=$container_name" | tee -a "$report_file"
  ) &
  local injector_pid=$!

  run_case "$case_name" "$chaos_failure_path"
  wait "$injector_pid" || true
}

run_with_custom_injection() {
  local case_name="$1"
  local chaos_failure_path="$2"
  local inject_cmd="$3"
  local recover_cmd="$4"
  local phase_label="$5"

  (
    sleep "$CHAOS_INJECT_START_DELAY_SECONDS"
    echo "[inject] $phase_label custom inject start" | tee -a "$report_file"
    bash -lc "$inject_cmd"
    echo "[inject] $phase_label custom inject done" | tee -a "$report_file"
  ) &
  local injector_pid=$!

  run_case "$case_name" "$chaos_failure_path"
  wait "$injector_pid" || true

  if [[ -n "$recover_cmd" ]]; then
    echo "[inject] $phase_label custom recover start" | tee -a "$report_file"
    if ! bash -lc "$recover_cmd"; then
      echo "[WARN] $phase_label recover command failed" | tee -a "$report_file"
      suite_failed=1
    fi
    echo "[inject] $phase_label custom recover done" | tee -a "$report_file"
  fi
}

run_case "baseline" ""

IFS=',' read -r -a failure_paths <<<"$CHAOS_FAILURE_PATHS"
for i in "${!failure_paths[@]}"; do
  path="${failure_paths[$i]}"
  trimmed="$(echo "$path" | xargs)"
  [[ -z "$trimmed" ]] && continue
  run_case "chaos_$((i + 1))" "$trimmed"
done

# Redis 단절 주입(기본: docker pause/unpause)
if [[ -n "$CHAOS_REDIS_INJECT_CMD" ]]; then
  run_with_custom_injection \
    "chaos_redis_disconnect" \
    "" \
    "$CHAOS_REDIS_INJECT_CMD" \
    "$CHAOS_REDIS_RECOVER_CMD" \
    "redis-disconnect"
else
  if [[ "$docker_available" -eq 1 ]]; then
    redis_container="$(resolve_container_name "$CHAOS_REDIS_CONTAINER" 'blog_home-redis_1(-1)?$|redis_1')"
    run_with_pause_injection \
      "chaos_redis_disconnect" \
      "" \
      "$redis_container" \
      "$CHAOS_REDIS_PAUSE_SECONDS" \
      "$CHAOS_INJECT_START_DELAY_SECONDS" \
      "redis-disconnect"
  fi
fi

# DB 지연/단절 주입(기본: docker pause/unpause, 운영에서는 custom command 권장)
if [[ -n "$CHAOS_DB_INJECT_CMD" ]]; then
  run_with_custom_injection \
    "chaos_db_delay" \
    "" \
    "$CHAOS_DB_INJECT_CMD" \
    "$CHAOS_DB_RECOVER_CMD" \
    "db-delay"
else
  if [[ "$docker_available" -eq 1 ]]; then
    db_container="$(resolve_container_name "$CHAOS_DB_CONTAINER" 'blog_home-db_1(-1)?$|db_1')"
    run_with_pause_injection \
      "chaos_db_delay" \
      "" \
      "$db_container" \
      "$CHAOS_DB_PAUSE_SECONDS" \
      "$CHAOS_INJECT_START_DELAY_SECONDS" \
      "db-delay"
  fi
fi

# API 5xx burst 주입(기본: 활성 API 컨테이너 pause/unpause)
if [[ -n "$CHAOS_API_INJECT_CMD" ]]; then
  run_with_custom_injection \
    "chaos_api_5xx_burst" \
    "" \
    "$CHAOS_API_INJECT_CMD" \
    "$CHAOS_API_RECOVER_CMD" \
    "api-5xx-burst"
else
  if [[ "$docker_available" -eq 1 ]]; then
    api_container="$(resolve_container_name "$CHAOS_API_CONTAINER" 'blog_home-back_(blue|green|read)-1$|back_(blue|green|read)')"
    run_with_pause_injection \
      "chaos_api_5xx_burst" \
      "" \
      "$api_container" \
      "$CHAOS_API_PAUSE_SECONDS" \
      "$CHAOS_INJECT_START_DELAY_SECONDS" \
      "api-5xx-burst"
  fi
fi

echo "results_dir=$OUT_DIR"
echo "report=$report_file"

if [[ $suite_failed -ne 0 ]]; then
  echo "[FAIL] chaos suite failed. report=$report_file" >&2
  exit 1
fi

echo "[PASS] chaos suite passed. report=$report_file"
