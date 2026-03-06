#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-https://geovito.com}"
SMOKE_ACCESS_ENV_FILE="${SMOKE_ACCESS_ENV_FILE:-$HOME/.config/geovito/smoke_access.env}"

if [[ -f "$SMOKE_ACCESS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SMOKE_ACCESS_ENV_FILE"
fi

CF_ACCESS_CLIENT_ID="${CF_ACCESS_CLIENT_ID:-}"
CF_ACCESS_CLIENT_SECRET="${CF_ACCESS_CLIENT_SECRET:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

hdrs=()
if [[ -n "$CF_ACCESS_CLIENT_ID" && -n "$CF_ACCESS_CLIENT_SECRET" ]]; then
  hdrs+=( -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" )
  hdrs+=( -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" )
fi

sitemap_file="$(mktemp)"
code="$(curl -sS -o "$sitemap_file" -w '%{http_code}' "${hdrs[@]}" "${BASE_URL}/sitemap.xml" || true)"
[[ "$code" == "200" ]] || fail "sitemap status=${code}"

if rg -q '/@' "$sitemap_file"; then
  fail "sitemap contains creator/profile routes"
else
  pass "sitemap excludes creator/profile routes"
fi

submitted_file="$(mktemp)"
approved_file="$(mktemp)"

docker compose up -d strapi >/dev/null
docker compose exec -T strapi node - <<'NODE' > "$submitted_file"
const { compileStrapi, createStrapi } = require('@strapi/strapi');

(async () => {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  try {
    const rows = await strapi.entityService.findMany('api::blog-post.blog-post', {
      publicationState: 'preview',
      filters: {
        content_source: 'user',
        submission_state: 'submitted',
        site_visibility: 'visible',
      },
      fields: ['post_id'],
      populate: { translations: true },
      limit: 1000,
    });

    for (const row of rows) {
      const translations = Array.isArray(row.translations) ? row.translations : [];
      for (const tr of translations) {
        if (!tr || !tr.slug || !tr.language) continue;
        process.stdout.write(`/${String(tr.language).toLowerCase()}/blog/${String(tr.slug).trim()}/\n`);
      }
    }
  } finally {
    await strapi.destroy();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE

docker compose exec -T strapi node - <<'NODE' > "$approved_file"
const { compileStrapi, createStrapi } = require('@strapi/strapi');

(async () => {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  try {
    const rows = await strapi.entityService.findMany('api::blog-post.blog-post', {
      publicationState: 'preview',
      filters: {
        content_source: 'user',
        submission_state: 'approved',
        mock: false,
        publishedAt: { $notNull: true },
      },
      fields: ['post_id'],
      populate: { translations: true },
      limit: 1000,
    });

    for (const row of rows) {
      const translations = Array.isArray(row.translations) ? row.translations : [];
      const en = translations.find(
        (t) =>
          String(t?.language || '').toLowerCase() === 'en' &&
          String(t?.status || '').toLowerCase() === 'complete' &&
          t?.runtime_translation !== true &&
          t?.indexable !== false
      );
      if (en?.slug) {
        const canonicalPath = String(en.canonical_path || '').trim();
        const resolvedPath = canonicalPath || `/en/blog/${String(en.slug).trim()}/`;
        process.stdout.write(`${resolvedPath}\n`);
      }
    }
  } finally {
    await strapi.destroy();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE

submitted_clean="$(mktemp)"
approved_clean="$(mktemp)"
rg '^/' "$submitted_file" > "$submitted_clean" || true
rg '^/' "$approved_file" > "$approved_clean" || true
mv "$submitted_clean" "$submitted_file"
mv "$approved_clean" "$approved_file"

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if rg -q "$path" "$sitemap_file"; then
    fail "submitted-visible post leaked into sitemap: $path"
  fi

  page_file="$(mktemp)"
  page_code="$(curl -sS -o "$page_file" -w '%{http_code}' "${hdrs[@]}" "${BASE_URL}${path}" || true)"
  if [[ "$page_code" == "200" ]]; then
    if rg -q 'meta name="robots" content="noindex,nofollow"' "$page_file"; then
      pass "submitted-visible post noindex verified: $path"
    else
      fail "submitted-visible post is missing noindex robots: $path"
    fi
  fi
  rm -f "$page_file"
done < "$submitted_file"

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  has_approved_candidate=true
  if rg -q "$path" "$sitemap_file"; then
    pass "approved indexable post present in sitemap: $path"
  else
    fail "approved indexable post missing in sitemap: $path"
  fi
done < "$approved_file"

if [[ "${has_approved_candidate:-false}" != "true" ]]; then
  pass "no approved indexable UGC post found for sitemap assertion"
fi

atlas_en="$(mktemp)"
atlas_de="$(mktemp)"
curl -sS -o "$atlas_en" "${hdrs[@]}" "${BASE_URL}/en/atlas/italy-pilot/" >/dev/null
curl -sS -o "$atlas_de" "${hdrs[@]}" "${BASE_URL}/de/atlas/italy-pilot/" >/dev/null

rg -q 'meta name="robots" content="index,follow"' "$atlas_en" || fail "atlas EN robots drift detected"
rg -q 'meta name="robots" content="noindex,nofollow"' "$atlas_de" || fail "atlas non-EN robots drift detected"
pass "atlas index gate baseline unchanged"

rm -f "$sitemap_file" "$submitted_file" "$approved_file" "$atlas_en" "$atlas_de"
echo "SEO DRIFT CHECK: PASS"
