# Geovito Stack (Clean Rebuild)

Bu repository artik import-calisan bir fabrika degil, **import-ready receiving platform** olarak tasarlandi.

Detayli mimari:
- `CORE_CONTRACT.md`
- `ARCHITECTURE.md`
- `LANGUAGE_SYSTEM.md`
- `SEARCH_SYSTEM.md`
- `SUGGESTIONS_SYSTEM.md`
- `PRE_IMPORT_GATE.md`
- `ENVIRONMENT.md`
- `DESIGN_IMPLEMENTATION_CONTRACT.md`

Hizli baslangic:
```bash
cd /home/ali/geovito-stack
bash tools/prod_up.sh
```

Mock data:
```bash
cd /home/ali/geovito-stack
ALLOW_MOCK_SEED=true bash tools/mock_data.sh seed
bash tools/mock_data.sh clear
bash tools/purge_mock.sh
```

Production smoke:
```bash
cd /home/ali/geovito-stack
bash tools/prod_health.sh
bash tools/prod_smoke_frontend.sh
bash tools/pre_import_index_gate_check.sh
bash tools/shell_smoke_test.sh
bash tools/pages_build_check.sh
bash tools/pre_design_gate_check.sh
```

Search contract export (Atlas complete-only):
```bash
cd /home/ali/geovito-stack
bash tools/export_search_documents.sh
```

Future isolated import workspace (design-only):
```bash
cd /home/ali/geovito-stack
ls -la import-workspace
bash import-workspace/scripts/validate_workspace.sh
```

Frontend:
```bash
cd /home/ali/geovito-stack/frontend
npm install
npm run dev
npm run i18n:check
```

Cloudflare Pages (monorepo) settings:
- Root directory: `frontend`
- Build command: `npm ci && npm run i18n:check && npm run build`
- Output directory: `dist`
- Node: `20`
