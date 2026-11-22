# shellcheck shell=bash

decode_b64() {
  if printf '' | base64 --decode >/dev/null 2>&1; then
    printf '%s' "$1" | base64 --decode
  else
    printf '%s' "$1" | base64 -d
  fi
}

cleanup_remote_tmp() {
  if [ -n "${REMOTE_TMP_DIR:-}" ] && [ -d "${REMOTE_TMP_DIR}" ]; then
    rm -rf "${REMOTE_TMP_DIR}" || true
  fi
}

upsert_env_key() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file
  [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 1
  [ -z "${value}" ] && return 0

  if [ -f "${file}" ] && grep -qE "^${key}=" "${file}"; then
    tmp_file="$(mktemp "${file}.tmp.XXXXXX")"
    awk -v key="${key}" '$0 !~ "^" key "=" { print }' "${file}" > "${tmp_file}"
    printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
    chmod 600 "${tmp_file}"
    mv "${tmp_file}" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

remove_env_key() {
  local key="$1"
  local file="$2"
  local tmp_file

  [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 1
  tmp_file="$(mktemp "${file}.tmp.XXXXXX")"
  awk -v key="${key}" '$0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" { print }' "${file}" > "${tmp_file}"
  chmod 600 "${tmp_file}"
  mv "${tmp_file}" "${file}"
}

# Key parsing must not be narrower than tools/env/validate-env.mjs parseEnvText, otherwise a
# value the contract accepts (leading spaces, `export ` prefix) would fail only at deploy.
read_prod_env_value() {
  awk -v key="$1" '
    match($0, "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=") {
      value = substr($0, RSTART + RLENGTH)
      gsub(/\r/, "", value)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value = substr(value, 2, length(value) - 2)
      print value
    }
  ' deploy/homeserver/.env.prod | tail -n 1
}

extract_env_value_from_text() {
  local key="$1"
  local text="$2"
  printf '%s\n' "${text}" | awk -v key="$key" '
    match($0, "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=") {
      value=substr($0, RSTART + RLENGTH)
      gsub(/\r/, "", value)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value = substr(value, 2, length(value) - 2)
      print value
    }
  ' | tail -n 1
}

extract_env_value() {
  local key="$1"
  extract_env_value_from_text "${key}" "$(cat deploy/homeserver/.env.prod)"
}

resolve_active_prod_db_name() {
  local value
  value="$(awk -F= '$1 == "custom.prod.dbName" || $1 == "CUSTOM_PROD_DBNAME" { print substr($0, index($0, "=") + 1) }' deploy/homeserver/.env.prod 2>/dev/null | tail -n 1 | tr -d '\r')"
  if [ -n "${value}" ]; then printf '%s\n' "${value}"; return; fi
  value="$(awk -F= '$1 == "DB_BASE_NAME" { print substr($0, index($0, "=") + 1) }' deploy/homeserver/.env.prod 2>/dev/null | tail -n 1 | tr -d '\r')"
  printf '%s_prod\n' "${value:-blog}"
}

preflight_profile_workspace_cutover_source_floor() {
  local mode="${1:-back}"
  local db_name table_exists marker_sha baseline_marker marker_present target_root_sha metadata_file tmp_meta
  case "${mode}" in
    back|front) ;;
    *)
      echo "unsupported profile workspace cutover preflight mode: ${mode}" >&2
      return 1
      ;;
  esac
  db_name="$(resolve_active_prod_db_name)"
  table_exists="$(docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T db_1 psql -U postgres -d "${db_name}" -At -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.platform_schema_cutover') IS NOT NULL" 2>/dev/null | tr -d '\r' | tail -n 1)" || {
    echo "profile workspace cutover (${mode}) preflight query failed" >&2
    return 1
  }
  [ "${table_exists}" = "f" ] && return 0
  [ "${table_exists}" = "t" ] || { echo "profile workspace cutover (${mode}) preflight catalog result is malformed" >&2; return 1; }
  marker_sha="$(docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T db_1 psql -U postgres -d "${db_name}" -At -v ON_ERROR_STOP=1 -c "SELECT COALESCE((SELECT source_sha FROM public.platform_schema_cutover WHERE cutover_id = 'profile-workspace-legacy-attrs'), '')" 2>/dev/null | tr -d '\r' | tail -n 1)" || {
    echo "profile workspace cutover (${mode}) marker query failed" >&2
    return 1
  }
  [ -z "${marker_sha}" ] && return 0
  [[ "${marker_sha}" =~ ^[0-9a-f]{40}$ && "${HOME_DEPLOY_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
    echo "profile workspace cutover (${mode}) preflight SHA is malformed" >&2
    return 1
  }
  marker_present="true"
  git cat-file -e "${marker_sha}^{commit}" 2>/dev/null || git fetch origin "${marker_sha}" --depth 1 2>/dev/null || marker_present="false"
  if [ "${marker_present}" = "true" ] && git cat-file -e "${marker_sha}^{commit}" 2>/dev/null; then
    if ! git merge-base --is-ancestor "${marker_sha}" "${HOME_DEPLOY_SHA}"; then
      if git merge-base "${marker_sha}" "${HOME_DEPLOY_SHA}" >/dev/null 2>&1; then
        echo "profile workspace cutover blocks a pre-cutover ${mode} deploy" >&2
        return 1
      fi
      marker_present="false"
    fi
  else
    marker_present="false"
  fi
  if [ "${marker_present}" = "false" ]; then
    target_root_sha="$(git rev-list --max-parents=0 "${HOME_DEPLOY_SHA}" | tail -n 1)"
    [[ "${target_root_sha}" =~ ^[0-9a-f]{40}$ ]] || {
      echo "profile workspace cutover (${mode}) reset root SHA is unavailable" >&2
      return 1
    }
    git merge-base --is-ancestor "${target_root_sha}" "${HOME_DEPLOY_SHA}" || {
      echo "profile workspace cutover (${mode}) reset root SHA is not an ancestor of deploy SHA" >&2
      return 1
    }
    if ! printf '%s\n' \
      "UPDATE public.platform_schema_cutover SET source_sha = :'target_root_sha' WHERE cutover_id = 'profile-workspace-legacy-attrs' AND source_sha = :'expected_sha';" \
      | docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T db_1 psql -U postgres -d "${db_name}" -At -v ON_ERROR_STOP=1 -v expected_sha="${marker_sha}" -v target_root_sha="${target_root_sha}" -f - >/dev/null; then
      echo "profile workspace cutover (${mode}) marker re-anchor failed" >&2
      return 1
    fi
    for metadata_file in deploy/homeserver/.deploy-baseline/metadata.env deploy/homeserver/.deploy-baseline.pending/metadata.env; do
      if [ -f "${metadata_file}" ]; then
        tmp_meta="$(mktemp "${metadata_file}.tmp.XXXXXX")"
        awk -F= -v root_sha="${target_root_sha}" '
          $1 == "deploy_sha" { print "deploy_sha=" root_sha; next }
          $1 == "profile_workspace_cutover_sha" { print "profile_workspace_cutover_sha=" root_sha; next }
          { print }
        ' "${metadata_file}" > "${tmp_meta}" && chmod 600 "${tmp_meta}" && mv "${tmp_meta}" "${metadata_file}" || {
          rm -f "${tmp_meta}"
          echo "profile workspace cutover baseline metadata re-anchor failed" >&2
          return 1
        }
      fi
    done
    echo "profile workspace cutover (${mode}) re-anchored after history reset: ${marker_sha} -> ${target_root_sha}"
    marker_sha="${target_root_sha}"
  fi
  if [ "${mode}" = "back" ]; then
    baseline_marker="$(awk -F= '$1 == "profile_workspace_cutover_sha" { print substr($0, index($0, "=") + 1) }' deploy/homeserver/.deploy-baseline/metadata.env 2>/dev/null | tail -n 1)"
    if [ "${baseline_marker}" != "${marker_sha}" ]; then
      PROFILE_WORKSPACE_CUTOVER_SHA="${marker_sha}" ./deploy/homeserver/record_deploy_baseline.sh --publish-pending || {
        echo "profile workspace cutover has no compatible baseline or recoverable pending baseline" >&2
        return 1
      }
    fi
  fi
}

preserve_pre_deploy_runtime_image_env_keys() {
  if [ "${PRE_DEPLOY_ENV_CAPTURED}" != "true" ]; then
    return 0
  fi

  local key previous current
  for key in \
    AUTOHEAL_IMAGE \
    DOCKER_SOCKET_PROXY_IMAGE \
    CLOUDFLARED_IMAGE \
    CADDY_IMAGE \
    UPTIME_KUMA_IMAGE \
    PROMETHEUS_IMAGE \
    ALERTMANAGER_IMAGE \
    POSTGRES_EXPORTER_IMAGE \
    GRAFANA_IMAGE \
    LOKI_IMAGE \
    PROMTAIL_IMAGE \
    FRONT_BLUE_IMAGE \
    FRONT_GREEN_IMAGE \
    BACK_BLUE_IMAGE \
    BACK_GREEN_IMAGE \
    BACK_READ_IMAGE \
    BACK_ADMIN_IMAGE \
    BACK_WORKER_IMAGE \
    NODE_RUNTIME_IMAGE \
    DB_IMAGE \
    REDIS_IMAGE \
    MINIO_IMAGE
  do
    previous="$(extract_env_value_from_text "${key}" "${PRE_DEPLOY_ENV_CONTENT}")"
    current="$(extract_env_value "${key}")"
    # HOME_SERVER_ENV wins whenever the secret pins the key. That is the only
    # operator lever to replace a stale digest already written on the server,
    # so preserve must never restore the pre-deploy value over it (#1407).
    if [ -n "${current}" ]; then
      if [ -n "${previous}" ] && [ "${current}" != "${previous}" ]; then
        echo "HOME_SERVER_ENV overrides ${key} from pre-deploy env: ${previous} -> ${current}"
      fi
      continue
    fi
    if [ -n "${previous}" ]; then
      upsert_env_key "${key}" "${previous}" "deploy/homeserver/.env.prod"
      echo "preserved ${key} from pre-deploy env after HOME_SERVER_ENV overwrite"
    fi
  done
}

resolve_local_repo_digest() {
  local image_ref="$1"
  docker image inspect --format '{{index .RepoDigests 0}}' "${image_ref}" 2>/dev/null | head -n 1 | tr -d '\r'
}

resolve_repo_digest_with_pull_fallback() {
  local image_ref="$1"
  local digest
  digest="$(resolve_local_repo_digest "${image_ref}" || true)"
  if [ -n "${digest}" ]; then
    printf '%s' "${digest}"
    return 0
  fi

  echo "local digest missing for ${image_ref}; pulling fallback image before deploy compose evaluation"
  docker pull "${image_ref}" >/dev/null || return 1
  digest="$(resolve_local_repo_digest "${image_ref}" || true)"
  if [ -z "${digest}" ]; then
    echo "fallback image pull did not provide repo digest: ${image_ref}" >&2
    return 1
  fi
  printf '%s' "${digest}"
}

ensure_image_key_from_local_digest() {
  local key="$1"
  local fallback_image="$2"
  local value
  value="$(extract_env_value "${key}")"
  if [ -n "${value}" ]; then
    return 0
  fi

  local digest
  if ! digest="$(resolve_repo_digest_with_pull_fallback "${fallback_image}")"; then
    echo "required image env key is missing and digest lookup failed: ${key} (fallback=${fallback_image})" >&2
    return 1
  fi

  upsert_env_key "${key}" "${digest}" "deploy/homeserver/.env.prod"
  echo "auto-filled ${key} from local digest (${fallback_image} -> ${digest})"
  return 0
}

require_nonempty_env_key() {
  local key="$1"
  local value
  value="$(extract_env_value "${key}")"
  if [ -z "${value}" ]; then
    echo "required env key is missing or empty: ${key}" >&2
    exit 1
  fi
}

require_pinned_image_value() {
  local key="$1"
  local value="$2"
  if [ -z "${value}" ]; then
    echo "required image env key is missing: ${key}" >&2
    exit 1
  fi
  if [[ "${value}" == *":latest" ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    exit 1
  fi
  if [[ "${value}" != *@sha256:* && "${value}" != *:* ]]; then
    echo "image must have tag or digest for ${key}: ${value}" >&2
    exit 1
  fi
}

require_pinned_image_key() {
  local key="$1"
  local value
  value="$(extract_env_value "${key}")"
  require_pinned_image_value "${key}" "${value}"
}

require_digest_image_value() {
  local key="$1"
  local value="$2"
  if [ -z "${value}" ]; then
    echo "required image value is missing: ${key}" >&2
    exit 1
  fi
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    exit 1
  fi
  if [[ ! "${value}" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]; then
    echo "image must be pinned by sha256 digest for ${key}: ${value}" >&2
    exit 1
  fi
}

require_digest_image_key() {
  local key="$1"
  local value
  value="$(extract_env_value "${key}")"
  require_digest_image_value "${key}" "${value}"
}
