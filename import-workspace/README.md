# Import Workspace (Future Isolated Operations)

Bu klasor **gelecekteki Atlas import operasyonu** icin ayrilmis izole alandir.

Kural:
- Bu sprintte import **calismaz**.
- Core runtime (`app/`, `frontend/`) import execution acmaz.
- `tools/run_import.sh` dormant kalir.

Amac:
- Import operasyonel dosyalarini core repodan ayri tutmak
- Token/secrets/ham cikti gibi riskli artefaktlari izole etmek
- Gelecekte dry-run/QC ve gercek import fazlarini kontrollu acmak

Bu klasorde sadece:
- dokumanlar,
- kontrat referanslari,
- profil kopyalari/referanslari,
- ve real import yapmayan placeholder scriptler bulunur.

Detayli gelecek adimlari:
- `RUNBOOK_IMPORT.md`
