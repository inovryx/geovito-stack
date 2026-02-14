from __future__ import annotations

from googleapiclient.discovery import build

from ..config import CollectorConfig, DateWindow, GOOGLE_SCOPE_GA4, get_google_credentials
from ..sanitize import sanitize_path, sanitize_rows
from ..schema import ProviderResult, make_provider_result


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_configured(config: CollectorConfig) -> bool:
    return bool(config.ga4_property_id and config.google_oauth_client_secret_file)


def collect_ga4(config: CollectorConfig, date_window: DateWindow, row_limit: int = 50) -> ProviderResult:
    if not _is_configured(config):
        return make_provider_result(
            provider="ga4",
            start=date_window.start,
            end=date_window.end,
            notes=["GA4 provider is dormant until GA4_PROPERTY_ID and Google OAuth config are set."],
            errors=["not configured"],
        )

    credentials = get_google_credentials(config, scopes=[GOOGLE_SCOPE_GA4])
    service = build("analyticsdata", "v1beta", credentials=credentials, cache_discovery=False)
    property_name = f"properties/{config.ga4_property_id}"

    totals_resp = (
        service.properties()
        .runReport(
            property=property_name,
            body={
                "dateRanges": [{"startDate": str(date_window.start), "endDate": str(date_window.end)}],
                "metrics": [{"name": "sessions"}, {"name": "activeUsers"}, {"name": "screenPageViews"}],
            },
        )
        .execute()
    )

    totals = (totals_resp.get("totals") or [{}])[0]
    total_values = totals.get("metricValues") or []
    metrics = {
        "sessions": _to_float((total_values[0] if len(total_values) > 0 else {}).get("value")),
        "activeUsers": _to_float((total_values[1] if len(total_values) > 1 else {}).get("value")),
        "screenPageViews": _to_float((total_values[2] if len(total_values) > 2 else {}).get("value")),
    }

    top_pages_resp = (
        service.properties()
        .runReport(
            property=property_name,
            body={
                "dateRanges": [{"startDate": str(date_window.start), "endDate": str(date_window.end)}],
                "dimensions": [{"name": "pagePath"}],
                "metrics": [{"name": "sessions"}, {"name": "screenPageViews"}],
                "orderBys": [
                    {"metric": {"metricName": "screenPageViews"}, "desc": True},
                    {"dimension": {"dimensionName": "pagePath"}},
                ],
                "limit": max(1, int(row_limit)),
            },
        )
        .execute()
    )

    page_rows: list[dict[str, object]] = []
    for row in top_pages_resp.get("rows", []):
        dim_values = row.get("dimensionValues") or []
        metric_values = row.get("metricValues") or []

        path = (dim_values[0] if len(dim_values) > 0 else {}).get("value", "")
        sessions = _to_float((metric_values[0] if len(metric_values) > 0 else {}).get("value"))
        pageviews = _to_float((metric_values[1] if len(metric_values) > 1 else {}).get("value"))

        page_rows.append(
            {
                "page": sanitize_path(str(path)),
                "sessions": sessions,
                "pageviews": pageviews,
            }
        )

    page_rows.sort(key=lambda item: (-float(item.get("pageviews", 0)), -float(item.get("sessions", 0)), str(item.get("page", ""))))

    return make_provider_result(
        provider="ga4",
        start=date_window.start,
        end=date_window.end,
        metrics=metrics,
        rows=sanitize_rows(page_rows, limit=row_limit),
        notes=[f"top_pages={min(len(page_rows), row_limit)}"],
    )
