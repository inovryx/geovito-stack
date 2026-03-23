# Log Retention Policy (Router Preparation)

## Locked Defaults
- Prod local buffer retention: `48h`
- Log VPS hot retention: `14d`
- Archive retention: `90d` (compressed)

Bu degerler Log Routing Preparation icin policy default'tur.

## Current Status (Disabled)
- Bu faz sadece hazirlik (template + docs) fazidir.
- Production -> Log VPS real forwarding AKTIF DEGIL.
- Archive export (R2/Home PC) AKTIF DEGIL.
- Runtime davranis degisikligi bu sprint kapsaminda YOK.

## Future Routing Model
When enabled in a future cutover:
1. Prod tarafinda `logs/channels/*.jsonl` okunur.
2. Router channel bazli ayirir (`app/security/moderation/audit/release/dr`).
3. Gecici local buffer (`48h`) tutulur.
4. Log VPS uzerinde hot retention (`14d`) uygulanir.
5. Archive retention (`90d`) uygulanir.

## Optional Future Archive Targets (Disabled by Default)
- `R2`:
  - Haftalik/periyodik compressed archive export.
  - Varsayilan durum: disabled.
- `HOME_PC`:
  - Opsiyonel offline mirror export.
  - Varsayilan durum: disabled.

## Notes
- LOG_CONTRACT JSON line formati korunur.
- Required field seti ve channel taxonomy lock bozulmaz.
