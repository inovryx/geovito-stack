# RELEASE HANDOFF

Last updated (UTC): 2026-03-17T12:04:47Z
Repo: `/home/ali/geovito-stack`
Branch: `main`

## Release Snapshot
- Latest strict full-gate PASS evidence: `artifacts/go-live/go-live-full-20260317T105604Z.txt`
- Latest strict full-gate run id: `gv-run-20260317T105604Z-16051`
- Latest strict full-pass checkpoint tag: `checkpoint-go-live-full-pass-20260317-1105`
- Latest checkpoint tag (post-pass docs sync): `checkpoint-go-live-full-pass-20260317-1109`
- Latest readiness state: `ready=true` (`error_samples=23`, `storage_samples=23`, `error_distinct_days=7`, `storage_distinct_days=7`)
- Latest readiness watch check: `2026-03-17T09:36:49.558Z`
- Latest trend report: `artifacts/observability/trend-report-last.txt` (`OVERALL=PASS`, generated at `2026-03-17T09:54:36Z`)
- Latest trend freshness: `artifacts/observability/trend-freshness-last.json` (`status=pass`, `age_minutes=70`)
- Trend logrotate: `/etc/logrotate.d/geovito-observability-trend` verified (`cron-trend.log.1` produced)
- Latest pushed commit at handoff creation: `bf52a3b`

## PASS Matrix (Latest Strict Pass)
- `Core Go-Live Gate` -> PASS
- `Staging Isolation` -> PASS
- `Restore Freshness` -> PASS
- `Kill Switch Smoke` -> PASS
- `Audit Log Smoke` -> PASS
- `SEO Drift Check` -> PASS
- `Error Rate Check` -> PASS
- `Storage Pressure Check` -> PASS
- `Observability Cron Schedule` -> PASS
- `Observability Cron Freshness` -> PASS
- `Readiness Cron Freshness` -> PASS
- `Observability Trend Freshness` -> PASS
- `Baseline Readiness Check` -> PASS
- `Readiness Watch Smoke` -> PASS
- `Override Policy Smoke` -> PASS

## Next Session Bootstrap (Copy/Paste)
```bash
cd /home/ali/geovito-stack
git pull --ff-only

git rev-parse --short=7 HEAD
git tag --list 'checkpoint-go-live-full-pass-*' | tail -n 8

LATEST_FULL="$(ls -1t artifacts/go-live/go-live-full-*.txt | head -n1)"
echo "$LATEST_FULL"
tail -n 40 "$LATEST_FULL"

cat artifacts/observability/baseline-readiness-last.json
cat artifacts/observability/readiness-watch-state.json
cat artifacts/observability/trend-report-last.txt

crontab -l | rg 'observability_sample|observability_readiness_watch|observability_trend_report'
```

## Strict Gate Re-Run Command
```bash
cd /home/ali/geovito-stack
GO_LIVE_BASELINE_READINESS_STRICT=true \
GO_LIVE_WITH_BACKUP_VERIFY=true \
GO_LIVE_WITH_SMTP=true \
RESET_SMOKE_EMAIL='geovitoworld@gmail.com' \
bash tools/go_live_gate_full.sh
```

## Post-PASS Tag Command
```bash
cd /home/ali/geovito-stack
git tag -a checkpoint-go-live-full-pass-$(date -u +%Y%m%d-%H%M) -m "Go-live full gate pass (strict rerun)"
git push origin --tags
```
