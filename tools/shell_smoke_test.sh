#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_PORT="${SHELL_SMOKE_PORT:-4173}"
BASE_URL="${SHELL_SMOKE_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT}}"
REPORT_FILE="$ROOT_DIR/artifacts/shell_smoke_report.tsv"
REUSE_DIST="${SHELL_SMOKE_REUSE_DIST:-0}"
FAIL_COUNT=0
SERVER_PID=""

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

normalize_banners() {
  local body="$1"
  local output=""

  if printf '%s' "$body" | rg -q 'class="[^"]*state-banner[^"]*mock[^"]*"|class="[^"]*mock[^"]*state-banner[^"]*"'; then
    output="${output}mock,"
  fi
  if printf '%s' "$body" | rg -q 'class="[^"]*state-banner[^"]*fallback[^"]*"|class="[^"]*fallback[^"]*state-banner[^"]*"'; then
    output="${output}fallback,"
  fi
  if printf '%s' "$body" | rg -q 'class="[^"]*state-banner[^"]*runtime[^"]*"|class="[^"]*runtime[^"]*state-banner[^"]*"'; then
    output="${output}runtime,"
  fi

  if [[ -z "$output" ]]; then
    echo "none"
    return
  fi

  echo "${output%,}"
}

normalize_canonical_url() {
  local value="$1"
  local trimmed="${value%/}"
  if [[ "$trimmed" == https://www.geovito.com* ]]; then
    echo "https://geovito.com${trimmed#https://www.geovito.com}"
    return
  fi
  echo "$trimmed"
}

assert_banner_expectation() {
  local found="$1"
  local expected="$2"
  local label="$3"

  if [[ "$expected" == "none" ]]; then
    if [[ "$found" == "none" ]]; then
      pass "$label"
    else
      fail "$label (unexpected banner set: $found)"
    fi
    return
  fi

  IFS=',' read -r -a expected_parts <<<"$expected"
  IFS=',' read -r -a found_parts <<<"$found"
  local found_joined=",$(IFS=,; echo "${found_parts[*]}"),"

  for expected_part in "${expected_parts[@]}"; do
    if [[ "$found_joined" != *",$expected_part,"* ]]; then
      fail "$label (missing banner: $expected_part, found: $found)"
      return
    fi
  done

  pass "$label"
}

check_page() {
  local path="$1"
  local expected_status="$2"
  local expected_robots="$3"
  local expected_canonical_contains="$4"
  local expected_banners="$5"
  local url="${BASE_URL}${path}"

  local tmp_file
  tmp_file="$(mktemp)"
  local status
  status="$(curl -sS -o "$tmp_file" -w '%{http_code}' "$url")"
  local body
  body="$(cat "$tmp_file")"
  rm -f "$tmp_file"

  local robots
  robots="$(printf '%s' "$body" | tr '\n' ' ' | sed -n 's/.*<meta name="robots" content="\([^"]*\)".*/\1/p')"
  local canonical
  canonical="$(printf '%s' "$body" | tr '\n' ' ' | sed -n 's/.*<link rel="canonical" href="\([^"]*\)".*/\1/p')"
  local banners
  banners="$(normalize_banners "$body")"

  if [[ "$expected_banners" != "none" && "$banners" == "none" ]]; then
    # Retry once to reduce transient read flakes when first response is incomplete.
    local retry_file retry_body
    retry_file="$(mktemp)"
    curl -sS -o "$retry_file" "$url" >/dev/null 2>&1 || true
    retry_body="$(cat "$retry_file")"
    rm -f "$retry_file"
    local retry_banners
    retry_banners="$(normalize_banners "$retry_body")"
    if [[ "$retry_banners" != "none" ]]; then
      body="$retry_body"
      banners="$retry_banners"
    fi
  fi

  local case_ok=1

  if [[ "$status" == "$expected_status" ]]; then
    pass "${path} status ${expected_status}"
  else
    fail "${path} status expected ${expected_status}, got ${status}"
    case_ok=0
  fi

  if [[ "$expected_robots" != "-" ]]; then
    if [[ "$robots" == "$expected_robots" ]]; then
      pass "${path} robots ${expected_robots}"
    else
      fail "${path} robots expected ${expected_robots}, got ${robots:-<missing>}"
      case_ok=0
    fi
  fi

  if [[ "$expected_canonical_contains" != "-" ]]; then
    local canonical_normalized expected_canonical_normalized
    canonical_normalized="$(normalize_canonical_url "$canonical")"
    expected_canonical_normalized="$(normalize_canonical_url "$expected_canonical_contains")"
    if [[ -n "$canonical_normalized" && "$canonical_normalized" == *"$expected_canonical_normalized"* ]]; then
      pass "${path} canonical contains ${expected_canonical_contains}"
    else
      fail "${path} canonical mismatch (got: ${canonical:-<missing>})"
      case_ok=0
    fi
  fi

  assert_banner_expectation "$banners" "$expected_banners" "${path} banners ${expected_banners}"
  if [[ "$expected_banners" == "none" && "$banners" != "none" ]]; then
    case_ok=0
  elif [[ "$expected_banners" != "none" ]]; then
    IFS=',' read -r -a expected_parts <<<"$expected_banners"
    for expected_part in "${expected_parts[@]}"; do
      if [[ ",${banners}," != *",${expected_part},"* ]]; then
        case_ok=0
      fi
    done
  fi

  local result="PASS"
  if [[ "$case_ok" -eq 0 ]]; then
    result="FAIL"
  fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$url" "$status" "${robots:-}" "${canonical:-}" "$banners" "$result" >>"$REPORT_FILE"
}

check_contains() {
  local path="$1"
  local pattern="$2"
  local label="$3"
  local url="${BASE_URL}${path}"
  local body
  body="$(curl -sS "$url")"
  if printf '%s' "$body" | rg -q "$pattern"; then
    pass "$label"
  else
    fail "$label (pattern not found: $pattern)"
  fi
}

echo "=============================================================="
echo "GEOVITO SHELL SMOKE TEST"
echo "=============================================================="

if [[ "$REUSE_DIST" == "1" ]]; then
  docker compose up -d strapi >/dev/null
  if [[ ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
    echo "FAIL: SHELL_SMOKE_REUSE_DIST=1 but frontend/dist/index.html is missing"
    echo "Run: bash tools/prod_smoke_frontend.sh"
    exit 1
  fi
else
  if [[ "${SHELL_SMOKE_SKIP_BUILD:-0}" == "1" ]]; then
    docker compose up -d strapi >/dev/null
  else
    docker compose up -d --build strapi >/dev/null
  fi

  bash tools/mock_data.sh clear >/dev/null
  ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed >/dev/null
  bash tools/prod_smoke_frontend.sh >/dev/null
fi

mkdir -p "$ROOT_DIR/artifacts"
printf "url\tstatus\trobots\tcanonical\tbanners\tresult\n" >"$REPORT_FILE"

pushd "$ROOT_DIR/frontend/dist" >/dev/null
python3 -m http.server "$FRONTEND_PORT" --bind 127.0.0.1 >/tmp/geovito_shell_smoke_server.log 2>&1 &
SERVER_PID="$!"
popd >/dev/null

for _ in $(seq 1 50); do
  if curl -s -o /dev/null "${BASE_URL}/"; then
    break
  fi
  sleep 0.2
done

check_page "/en/atlas/turkiye/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/turkiye" "mock"
check_page "/en/atlas/united-states/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/united-states" "mock"
check_page "/en/atlas/germany/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/germany" "mock"

check_page "/en/atlas/antalya/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/antalya" "mock"
check_page "/en/atlas/new-york-city/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/new-york-city" "mock"
check_page "/en/atlas/berlin/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/berlin" "mock"

check_page "/en/atlas/kas-antalya/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/kas-antalya" "mock"
check_page "/en/atlas/manhattan/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/manhattan" "mock"
check_page "/en/atlas/mitte-berlin/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/mitte-berlin" "mock"

check_page "/en/atlas/antiphellos-ruins/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/antiphellos-ruins" "mock"
check_page "/en/atlas/times-square/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/times-square" "mock"

check_page "/en/regions/tr-mediterranean-region/" "200" "noindex,nofollow" "https://www.geovito.com/en/regions/tr-mediterranean-region" "mock"
check_page "/de/regions/tr-mediterranean-region/" "200" "noindex,nofollow" "https://www.geovito.com/en/regions/tr-mediterranean-region" "mock,fallback"
check_page "/en/regions/it-pilot-region/" "200" "index,follow" "https://www.geovito.com/en/regions/it-pilot-region" "none"
check_page "/de/regions/it-pilot-region/" "200" "noindex,nofollow" "https://www.geovito.com/en/regions/it-pilot-region" "fallback"

check_contains "/en/atlas/kas-antalya/" "/en/blog/reading-city-through-district-layers/" "Kas page related blog link"
check_contains "/en/atlas/manhattan/" "/en/blog/neighborhood-food-walks-no-tourist-traps/" "Manhattan page related blog link"
check_contains "/en/atlas/mitte-berlin/" "/en/blog/reading-city-through-district-layers/" "Mitte page related blog link"
check_contains "/en/regions/tr-mediterranean-region/" "/en/atlas/antalya/" "TR region page city-like member link"

check_page "/en/blog/" "200" "noindex,nofollow" "https://www.geovito.com/en/blog/" "mock"
check_page "/en/blog/plan-3-day-europe-city-break/" "200" "noindex,nofollow" "https://www.geovito.com/en/blog/plan-3-day-europe-city-break" "mock"
check_page "/en/blog/reading-city-through-district-layers/" "200" "noindex,nofollow" "https://www.geovito.com/en/blog/reading-city-through-district-layers" "mock"

check_contains "/en/atlas/new-york-city/" "data-embed-gallery" "NYC page embed gallery"
check_contains "/en/atlas/new-york-city/" "youtube-nocookie\\.com/embed/" "NYC page youtube embed"
check_contains "/en/blog/neighborhood-food-walks-no-tourist-traps/" "facebook\\.com/plugins/video\\.php" "Blog page facebook embed"
check_contains "/en/blog/plan-3-day-europe-city-break/" "rel=\"[^\"]*(noopener[^\"]*noreferrer[^\"]*nofollow|noopener[^\"]*nofollow[^\"]*noreferrer|noreferrer[^\"]*noopener[^\"]*nofollow|noreferrer[^\"]*nofollow[^\"]*noopener|nofollow[^\"]*noopener[^\"]*noreferrer|nofollow[^\"]*noreferrer[^\"]*noopener)[^\"]*\"" "Embed source link rel policy"

check_page "/en/account/" "200" "noindex,nofollow" "https://www.geovito.com/en/account/" "none"
check_page "/en/dashboard/" "200" "noindex" "https://www.geovito.com/en/login/" "none"

check_page "/de/atlas/turkiye/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/turkiye" "mock,fallback"
check_page "/tr/atlas/turkiye/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/turkiye" "mock"
check_page "/en/atlas/italy-pilot/" "200" "index,follow" "https://www.geovito.com/en/atlas/italy-pilot" "none"
check_page "/de/atlas/italy-pilot/" "200" "noindex,nofollow" "https://www.geovito.com/en/atlas/italy-pilot" "fallback"

check_page "/en/atlas/not-a-real-place/" "404" "-" "-" "none"

echo "Report: $REPORT_FILE"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "Shell smoke checks failed: $FAIL_COUNT"
  exit 1
fi

echo "All shell smoke checks passed."
