from __future__ import annotations

from googleapiclient.discovery import build

from ..config import CollectorConfig, DateWindow, GOOGLE_SCOPE_ADSENSE, get_google_credentials
from ..sanitize import sanitize_rows
from ..schema import ProviderResult, make_provider_result


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_configured(config: CollectorConfig) -> bool:
    return bool(config.google_oauth_client_secret_file)


def _resolve_account(service, configured_account: str | None) -> str:
    if configured_account:
        return configured_account

    response = service.accounts().list(pageSize=10).execute()
    accounts = response.get("accounts") or []
    if not accounts:
        raise RuntimeError("AdSense account discovery failed: no accounts found")
    return str(accounts[0].get("name"))


def collect_adsense(config: CollectorConfig, date_window: DateWindow, row_limit: int = 50) -> ProviderResult:
    if not _is_configured(config):
        return make_provider_result(
            provider="adsense",
            start=date_window.start,
            end=date_window.end,
            notes=["AdSense provider is dormant until Google OAuth config is set."],
            errors=["not configured"],
        )

    credentials = get_google_credentials(config, scopes=[GOOGLE_SCOPE_ADSENSE])
    service = build("adsense", "v2", credentials=credentials, cache_discovery=False)
    account_name = _resolve_account(service, config.adsense_account)

    report = (
        service.accounts()
        .reports()
        .generate(
            name=account_name,
            dateRange="CUSTOM",
            startDate_year=date_window.start.year,
            startDate_month=date_window.start.month,
            startDate_day=date_window.start.day,
            endDate_year=date_window.end.year,
            endDate_month=date_window.end.month,
            endDate_day=date_window.end.day,
            metrics=["ESTIMATED_EARNINGS", "IMPRESSIONS", "PAGE_VIEWS_RPM"],
            dimensions=["DATE"],
            orderBy=["+DATE"],
            limit=max(1, int(row_limit)),
        )
        .execute()
    )

    totals = report.get("totals") or []
    totals_values = [item.get("value") for item in totals if isinstance(item, dict)]
    metrics = {
        "estimatedEarnings": _to_float(totals_values[0] if len(totals_values) > 0 else 0),
        "impressions": _to_float(totals_values[1] if len(totals_values) > 1 else 0),
        "pageViewsRpm": _to_float(totals_values[2] if len(totals_values) > 2 else 0),
    }

    headers = report.get("headers") or []
    header_names = [str(header.get("name", "")).lower() for header in headers]

    rows: list[dict[str, object]] = []
    for row in report.get("rows") or []:
        cells = row.get("cells") or []
        values = [cell.get("value") if isinstance(cell, dict) else None for cell in cells]

        row_data: dict[str, object] = {"kind": "daily"}
        for name, value in zip(header_names, values):
            if name == "date":
                row_data["date"] = str(value or "")
            elif name in {"estimated_earnings", "impressions", "page_views_rpm"}:
                key = {
                    "estimated_earnings": "estimatedEarnings",
                    "impressions": "impressions",
                    "page_views_rpm": "pageViewsRpm",
                }[name]
                row_data[key] = _to_float(value)

        rows.append(row_data)

    rows.sort(key=lambda item: str(item.get("date", "")))

    notes = [f"account={account_name}"]
    if not config.adsense_account:
        notes.append("account_discovered=true")

    return make_provider_result(
        provider="adsense",
        start=date_window.start,
        end=date_window.end,
        metrics=metrics,
        rows=sanitize_rows(rows, limit=row_limit),
        notes=notes,
    )
