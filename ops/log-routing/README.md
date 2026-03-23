# Log Routing Preparation (Disabled by Default)

Bu klasor future continuous log streaming icin router-ready hazirlik sablonlarini tutar.
Bu sprintte aktivasyon YOK: production tarafinda forwarding yapilmaz, log VPS ingest calismaz.

## Hedef Akis (Future)
`prod logs/channels/*.jsonl` -> `prod log router local buffer` -> `log VPS ingest` -> `channel bazli dosyalar` -> `hot/archive`

## Kilit Kurallar
- Disabled by default: aktivasyon oncesi hicbir real forwarding/export yok.
- LOG_CONTRACT uyumu korunur: JSON line formati + locked channel seti.
- Channel split sabit: `app`, `security`, `moderation`, `audit`, `release`, `dr`.

## Required Env Defaults
| Variable | Default | Notes |
| --- | --- | --- |
| `PROD_BUFFER_HOURS` | `48h` | Prod local spool/buffer suresi |
| `LOG_RETENTION_DAYS_HOT` | `14d` | Log VPS hot retention |
| `LOG_ARCHIVE_DAYS` | `90d` | Archive retention |
| `LOG_VPS_HOST` | required | Log VPS hedef host |
| `LOG_VPS_PORT` | required | Log VPS ingest port |

## Templates
- `templates/prod_log_router.template`
- `templates/logvps_ingest.template`

Template dili agent-agnostic pseudocode olarak tasarlanmistir. Aktivasyon aninda secilen agent'a (vector/fluent-bit/rsyslog) map edilmelidir.

## Future Activation Path (Not Now)
1. Production router config'i secilen agente uygula (`enabled=true` only during cutover).
2. Log VPS ingest config'i uygula (`enabled=true` only during cutover).
3. Canary: sadece tek channel (`release`) ile test et, sonra tum channel setine ac.
4. Rollback: router forwarding'i tekrar `enabled=false` yap, local buffer'da kal.

## Optional Future Archive Export Targets (Disabled)
- `R2`: haftalik/periyodik compressed archive export (opsiyonel, disabled).
- `HOME_PC`: offline mirror export (opsiyonel, disabled).

## Validation (Dry-Run)
Hazirlik dosyalarini runtime degisiklik yapmadan dogrulamak icin:

```bash
bash tools/log_routing_config_smoke.sh
```
