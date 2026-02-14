# GeoVito Metrics Collector

Local-first, privacy-safe CLI to fetch aggregated metrics from:
- GA4 Data API
- Google Search Console Search Analytics API
- Cloudflare GraphQL Analytics API
- AdSense Management API v2

This tool is isolated from frontend runtime/build. It only runs when explicitly executed.

## Install

From `tools/metrics_collector`:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e .[dev]
```

## Configure

Copy and fill tool-local env file:

```bash
cp .env.example .env
```

Important variables:
- `GA4_PROPERTY_ID`
- `GSC_SITE_URL`
- `GOOGLE_OAUTH_CLIENT_SECRET_FILE`
- `GOOGLE_TOKEN_CACHE`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID` (optional)
- `ADSENSE_ACCOUNT` (optional, auto-discovery fallback)
- `COLLECTOR_TIMEZONE` (used when `--date` is omitted)

## Google OAuth (Installed App)

1. Open Google Cloud Console.
2. Create/select a project.
3. Enable APIs:
   - Analytics Data API
   - Search Console API
   - AdSense Management API
4. Create OAuth client credentials: **Desktop app**.
5. Download JSON and set path in `GOOGLE_OAUTH_CLIENT_SECRET_FILE`.
6. First run opens local browser consent flow and stores token in `GOOGLE_TOKEN_CACHE`.

Readonly scopes only are used.

## Run

From `tools/metrics_collector`:

```bash
python -m geovito_metrics_collector run --days 7
```

Example with explicit date and path:

```bash
python -m geovito_metrics_collector run --date 2026-02-14 --days 7 --out ../../data/metrics
```

Optional flags:
- `--providers ga4,gsc,cloudflare,adsense`
- `--dry-run`
- `--json-pretty`
- `--fail-soft`
- `--env-file /path/to/.env`

## Output

Files are written to:

```text
/data/metrics/YYYY-MM-DD/
  ga4.json
  gsc.json
  cloudflare.json
  adsense.json
  summary.json
```

Rows are sanitized and aggregated only:
- URLs are stored as path-only (no scheme/host/query/hash).
- Queries are truncated/redacted.
- No user identifiers, cookies, IPs, or full referrers are stored.

## Tests

```bash
pytest
```

## Optional scheduling (manual)

- Windows: Task Scheduler
- Ubuntu: cron

No cron jobs are created by this repo automatically.

## Security notes

- Never commit `.env`, OAuth client secrets, or token cache files.
- Keep `GOOGLE_TOKEN_CACHE` outside repo (default: `~/.config/geovito/tokens.json`).
