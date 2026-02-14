from __future__ import annotations

from googleapiclient.discovery import build

from ..config import CollectorConfig, DateWindow, GOOGLE_SCOPE_GSC, get_google_credentials
from ..sanitize import sanitize_path, sanitize_query, sanitize_rows
from ..schema import ProviderResult, make_provider_result


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_configured(config: CollectorConfig) -> bool:
    return bool(config.gsc_site_url and config.google_oauth_client_secret_file)


def _run_query(service, site_url: str, body: dict) -> dict:
    return service.searchanalytics().query(siteUrl=site_url, body=body).execute()


def _sorted_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return sorted(
        rows,
        key=lambda item: (
            -float(item.get("clicks", 0)),
            -float(item.get("impressions", 0)),
            str(item.get("value", "")),
            str(item.get("kind", "")),
        ),
    )


def collect_gsc(config: CollectorConfig, date_window: DateWindow, row_limit: int = 50) -> ProviderResult:
    if not _is_configured(config):
        return make_provider_result(
            provider="gsc",
            start=date_window.start,
            end=date_window.end,
            notes=["GSC provider is dormant until GSC_SITE_URL and Google OAuth config are set."],
            errors=["not configured"],
        )

    credentials = get_google_credentials(config, scopes=[GOOGLE_SCOPE_GSC])
    service = build("searchconsole", "v1", credentials=credentials, cache_discovery=False)
    site_url = str(config.gsc_site_url)

    totals_resp = _run_query(
        service,
        site_url,
        {
            "startDate": str(date_window.start),
            "endDate": str(date_window.end),
            "rowLimit": 1,
        },
    )

    total_row = (totals_resp.get("rows") or [{}])[0]
    metrics = {
        "clicks": _to_float(total_row.get("clicks")),
        "impressions": _to_float(total_row.get("impressions")),
        "ctr": _to_float(total_row.get("ctr")),
        "position": _to_float(total_row.get("position")),
    }

    def dimension_rows(dimension: str, kind: str) -> list[dict[str, object]]:
        response = _run_query(
            service,
            site_url,
            {
                "startDate": str(date_window.start),
                "endDate": str(date_window.end),
                "dimensions": [dimension],
                "rowLimit": max(1, int(row_limit)),
            },
        )
        prepared: list[dict[str, object]] = []
        for row in response.get("rows", []):
            keys = row.get("keys") or []
            value = str(keys[0]) if keys else ""
            if kind == "page":
                value = sanitize_path(value)
            elif kind == "query":
                value = sanitize_query(value)

            prepared.append(
                {
                    "kind": kind,
                    "value": value,
                    "clicks": _to_float(row.get("clicks")),
                    "impressions": _to_float(row.get("impressions")),
                    "ctr": _to_float(row.get("ctr")),
                    "position": _to_float(row.get("position")),
                }
            )
        return _sorted_rows(prepared)

    rows = (
        dimension_rows("query", "query")
        + dimension_rows("page", "page")
        + dimension_rows("country", "country")
        + dimension_rows("device", "device")
    )

    return make_provider_result(
        provider="gsc",
        start=date_window.start,
        end=date_window.end,
        metrics=metrics,
        rows=sanitize_rows(rows, limit=row_limit),
        notes=["rows include top query/page/country/device segments"],
    )
