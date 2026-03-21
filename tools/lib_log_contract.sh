#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${GV_LOG_CONTRACT_LIB_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
GV_LOG_CONTRACT_LIB_LOADED=1

_gv_parse_bool() {
  local value="${1:-}" fallback="${2:-false}"
  if [[ -z "$value" ]]; then
    [[ "$fallback" == "true" ]] && echo "true" || echo "false"
    return
  fi
  case "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) echo "true" ;;
    0|false|no|off) echo "false" ;;
    *) [[ "$fallback" == "true" ]] && echo "true" || echo "false" ;;
  esac
}

gv_log_contract_init() {
  GV_LOG_SERVICE="${1:-scripts}"
  GV_LOG_ENV="${APP_ENV:-${GEOVITO_ENV:-${NODE_ENV:-dev}}}"
  case "$(printf '%s' "$GV_LOG_ENV" | tr '[:upper:]' '[:lower:]')" in
    production|prod) GV_LOG_ENV="prod" ;;
    staging|stage) GV_LOG_ENV="staging" ;;
    development|dev) GV_LOG_ENV="dev" ;;
  esac

  GV_LOG_CONTRACT_ENABLED="$(_gv_parse_bool "${LOG_CONTRACT_ENABLED:-true}" true)"
  GV_LOG_CONTRACT_STDOUT="$(_gv_parse_bool "${LOG_CONTRACT_STDOUT:-true}" true)"
  GV_LOG_CONTRACT_FILE_ENABLED="$(_gv_parse_bool "${LOG_CONTRACT_FILE_ENABLED:-true}" true)"

  GV_LOG_CONTRACT_FILE_ROOT="${LOG_CONTRACT_FILE_ROOT:-logs/channels}"
  GV_LOG_CONTRACT_FILE_ROOT="$(realpath -m "$GV_LOG_CONTRACT_FILE_ROOT")"

  if [[ "$GV_LOG_CONTRACT_ENABLED" == "true" && "$GV_LOG_CONTRACT_FILE_ENABLED" == "true" ]]; then
    if ! mkdir -p "$GV_LOG_CONTRACT_FILE_ROOT" 2>/dev/null; then
      echo "WARN: contract log file root is not creatable (${GV_LOG_CONTRACT_FILE_ROOT}); file output disabled." >&2
      GV_LOG_CONTRACT_FILE_ENABLED="false"
    elif [[ ! -w "$GV_LOG_CONTRACT_FILE_ROOT" ]]; then
      local fallback_root
      fallback_root="${LOG_CONTRACT_FILE_FALLBACK_ROOT:-artifacts/logs/channels}"
      fallback_root="$(realpath -m "$fallback_root")"
      if mkdir -p "$fallback_root" 2>/dev/null && [[ -w "$fallback_root" ]]; then
        echo "WARN: contract log file root is not writable (${GV_LOG_CONTRACT_FILE_ROOT}); using fallback ${fallback_root}." >&2
        GV_LOG_CONTRACT_FILE_ROOT="$fallback_root"
      else
        echo "WARN: contract log file root is not writable (${GV_LOG_CONTRACT_FILE_ROOT}) and fallback is unavailable; file output disabled." >&2
        GV_LOG_CONTRACT_FILE_ENABLED="false"
      fi
    fi
  fi

  GV_LOG_RUN_ID="${RUN_ID:-${REQUEST_ID:-gv-run-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}}"
  export RUN_ID="$GV_LOG_RUN_ID"
}

_gv_json_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  value="${value//$'\t'/ }"
  printf '%s' "$value"
}

_gv_trim() {
  local value="${1-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

_gv_redact_text() {
  local value="${1-}"
  [[ -n "$value" ]] || {
    printf ''
    return 0
  }

  value="$(printf '%s' "$value" | sed -E \
    -e 's/(bearer[[:space:]]+)[A-Za-z0-9._~+\/=-]+/\1[REDACTED]/Ig' \
    -e 's/((token|secret|password|authorization|api[_-]?key|jwt|cookie)[A-Za-z0-9_.-]*[[:space:]]*[:=][[:space:]]*)[^,;[:space:]]+/\1[REDACTED]/Ig' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[REDACTED_EMAIL]/g' \
    -e 's/\b([0-9]{1,3}\.){3}[0-9]{1,3}\b/[REDACTED_IP]/g' \
    -e 's/\b([[:xdigit:]]{1,4}:){2,7}[[:xdigit:]]{1,4}\b/[REDACTED_IP]/Ig')"

  printf '%s' "$value"
}

_gv_redact_detail() {
  local raw="${1-}"
  [[ -n "$raw" ]] || {
    printf ''
    return 0
  }

  local -a parts=()
  local output="" part trimmed key normalized_key redacted
  IFS=';' read -r -a parts <<< "$raw"
  for part in "${parts[@]}"; do
    trimmed="$(_gv_trim "$part")"
    [[ -n "$trimmed" ]] || continue

    if [[ "$trimmed" == *"="* ]]; then
      key="${trimmed%%=*}"
      normalized_key="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
      case "$normalized_key" in
        guestemail|guest_email|guest-email|reporteremail|reporter_email|reporter-email)
          continue
          ;;
      esac
    fi

    redacted="$(_gv_redact_text "$trimmed")"
    if [[ -n "$output" ]]; then
      output="${output};${redacted}"
    else
      output="$redacted"
    fi
  done

  printf '%s' "$output"
}

gv_log_contract_emit() {
  local channel="${1:-app}"
  local level="${2:-info}"
  local msg="${3:-}"
  local route_or_action="${4:-script.action}"
  local status="${5:-null}"
  local latency_ms="${6:-null}"
  local detail="${7:-}"
  local request_id="${8:-${GV_LOG_RUN_ID:-}}"
  local user_ref="${9:-null}"

  [[ "${GV_LOG_CONTRACT_ENABLED:-false}" == "true" ]] || return 0

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local status_json="null"
  if [[ "$status" =~ ^[0-9]+$ ]]; then
    status_json="$status"
  fi

  local latency_json="null"
  if [[ "$latency_ms" =~ ^[0-9]+$ ]]; then
    latency_json="$latency_ms"
  fi

  local user_ref_json="null"
  if [[ -n "$user_ref" && "$user_ref" != "null" ]]; then
    user_ref_json="\"$(_gv_json_escape "$user_ref")\""
  fi

  local detail_part=""
  local redacted_msg redacted_detail
  redacted_msg="$(_gv_redact_text "$msg")"
  redacted_detail="$(_gv_redact_detail "$detail")"

  if [[ -n "$redacted_detail" ]]; then
    detail_part=",\"detail\":\"$(_gv_json_escape "$redacted_detail")\""
  fi

  local line
  line="{\"ts\":\"$ts\",\"env\":\"$(_gv_json_escape "${GV_LOG_ENV:-dev}")\",\"channel\":\"$(_gv_json_escape "$channel")\",\"level\":\"$(_gv_json_escape "$level")\",\"msg\":\"$(_gv_json_escape "$redacted_msg")\",\"request_id\":\"$(_gv_json_escape "$request_id")\",\"service\":\"$(_gv_json_escape "${GV_LOG_SERVICE:-scripts}")\",\"route_or_action\":\"$(_gv_json_escape "$route_or_action")\",\"status\":${status_json},\"latency_ms\":${latency_json},\"user_ref\":${user_ref_json},\"meta\":{\"run_id\":\"$(_gv_json_escape "${GV_LOG_RUN_ID:-}")\"${detail_part}}}"

  if [[ "${GV_LOG_CONTRACT_STDOUT:-false}" == "true" ]]; then
    printf '%s\n' "$line"
  fi

  if [[ "${GV_LOG_CONTRACT_FILE_ENABLED:-false}" == "true" ]]; then
    if ! {
      printf '%s\n' "$line" >> "${GV_LOG_CONTRACT_FILE_ROOT}/${channel}.jsonl" &&
      printf '%s\n' "$line" >> "${GV_LOG_CONTRACT_FILE_ROOT}/all.jsonl"
    }; then
      echo "WARN: failed to append contract log line to ${GV_LOG_CONTRACT_FILE_ROOT}; continuing with stdout only." >&2
      GV_LOG_CONTRACT_FILE_ENABLED="false"
    fi
  fi
}
