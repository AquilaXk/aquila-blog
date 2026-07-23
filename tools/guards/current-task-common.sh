#!/usr/bin/env bash

current_task_repo_root() {
  git rev-parse --show-toplevel
}

current_task_tasks_dir() {
  local repo_root="$1"
  printf '%s\n' "${CURRENT_TASK_TASKS_DIR:-${repo_root}/.codex/tasks}"
}

current_task_legacy_file() {
  local repo_root="$1"
  printf '%s\n' "${CURRENT_TASK_LEGACY_FILE:-${repo_root}/.codex/current-task.local}"
}

current_task_archive_dir() {
  local repo_root="$1"
  local tasks_dir
  tasks_dir="$(current_task_tasks_dir "${repo_root}")"
  printf '%s\n' "${CURRENT_TASK_ARCHIVE_DIR:-${tasks_dir}/archive}"
}

current_task_slugify() {
  local raw="$1"
  printf '%s' "${raw}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#[^a-z0-9]+#-#g; s#^-+##; s#-+$##; s#--+#-#g'
}

current_task_work_item_file() {
  local repo_root="$1"
  local raw_key="${CURRENT_TASK_SLUG:-${CURRENT_TASK_KEY:-}}"
  [[ -n "${raw_key}" ]] || return 0

  local tasks_dir slug
  tasks_dir="$(current_task_tasks_dir "${repo_root}")"
  slug="$(current_task_slugify "${raw_key}")"
  [[ -n "${slug}" ]] || return 0

  printf '%s/%s.local\n' "${tasks_dir}" "${slug}"
}

current_task_file_key() {
  local file="$1"
  local base_name
  base_name="$(basename "${file}")"
  printf '%s\n' "${base_name%.local}"
}

current_task_as_relative() {
  local repo_root="$1"
  local absolute_path="$2"
  if [[ "${absolute_path}" == "${repo_root}/"* ]]; then
    printf '%s\n' "${absolute_path#${repo_root}/}"
    return 0
  fi

  if [[ "${absolute_path}" == "${repo_root}" ]]; then
    printf '.\n'
    return 0
  fi

  printf '%s\n' "${absolute_path}"
}

current_task_iter_files() {
  local repo_root="$1"
  local tasks_dir legacy_file
  tasks_dir="$(current_task_tasks_dir "${repo_root}")"
  legacy_file="$(current_task_legacy_file "${repo_root}")"

  if [[ -d "${tasks_dir}" ]]; then
    find "${tasks_dir}" -maxdepth 1 -type f -name '*.local' | LC_ALL=C sort
  fi

  if [[ -f "${legacy_file}" ]]; then
    printf '%s\n' "${legacy_file}"
  fi
}

current_task_read_field() {
  local file="$1"
  local key="$2"
  local prefix="${key}="

  if [[ ! -f "${file}" ]]; then
    return 0
  fi

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%%$'\r'}"
    [[ -z "${line}" ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    if [[ "${line}" == "${prefix}"* ]]; then
      printf '%s\n' "${line#${prefix}}"
      return 0
    fi
  done < "${file}"
}

current_task_read_scope_mode() {
  local file="$1"
  local scope_mode
  scope_mode="$(current_task_read_field "${file}" "scope_mode")"
  if [[ -z "${scope_mode}" ]]; then
    scope_mode="staged"
  fi
  printf '%s\n' "${scope_mode}"
}
