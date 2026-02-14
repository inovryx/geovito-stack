from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any

import requests

from ..config import CollectorConfig, DateWindow
from ..sanitize import sanitize_path, sanitize_rows
from ..schema import ProviderResult, make_provider_result

CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"


ZONE_QUERY = """
query Metrics($zoneTag: String!, $start: Time!, $end: Time!, $limit: Int!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      totals: httpRequestsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $start, datetime_lt: $end }
      ) {
        sum {
          requests
          bytes
        }
      }
      topPaths: httpRequestsAdaptiveGroups(
        limit: $limit
        filter: { datetime_geq: $start, datetime_lt: $end }
        orderBy: [sum_requests_DESC]
      ) {
        dimensions {
          clientRequestPath
        }
        sum {
          requests
          bytes
        }
      }
      statusGroups: httpRequestsAdaptiveGroups(
        limit: 200
        filter: { datetime_geq: $start, datetime_lt: $end }
      ) {
        dimensions {
          edgeResponseStatus
        }
        sum {
          requests
        }
      }
    }
  }
}
"""


ACCOUNT_QUERY = """
query Metrics($accountTag: String!, $start: Time!, $end: Time!, $limit: Int!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      totals: httpRequestsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $start, datetime_lt: $end }
      ) {
        sum {
          requests
          bytes
        }
      }
      topPaths: httpRequestsAdaptiveGroups(
        limit: $limit
        filter: { datetime_geq: $start, datetime_lt: $end }
        orderBy: [sum_requests_DESC]
      ) {
        dimensions {
          clientRequestPath
        }
        sum {
          requests
          bytes
        }
      }
      statusGroups: httpRequestsAdaptiveGroups(
        limit: 200
        filter: { datetime_geq: $start, datetime_lt: $end }
      ) {
        dimensions {
          edgeResponseStatus
        }
        sum {
          requests
        }
      }
    }
  }
}
"""


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_configured(config: CollectorConfig) -> bool:
    return bool(config.cloudflare_api_token and config.cloudflare_account_id)


def _group_status(status_code: int) -> str:
    hundred = max(0, min(9, status_code // 100))
    return f"{hundred}xx"


def _window_to_datetimes(date_window: DateWindow) -> tuple[str, str]:
    start_dt = datetime.combine(date_window.start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(date_window.end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start_dt.isoformat().replace("+00:00", "Z"), end_dt.isoformat().replace("+00:00", "Z")


def _post_graphql(token: str, query: str, variables: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        CLOUDFLARE_GRAPHQL_URL,
        json={"query": query, "variables": variables},
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("errors"):
        messages = "; ".join(str(err.get("message", "unknown error")) for err in payload["errors"])
        raise RuntimeError(f"Cloudflare GraphQL error: {messages}")
    return payload


def collect_cloudflare(config: CollectorConfig, date_window: DateWindow, row_limit: int = 50) -> ProviderResult:
    if not _is_configured(config):
        return make_provider_result(
            provider="cloudflare",
            start=date_window.start,
            end=date_window.end,
            notes=["Cloudflare provider is dormant until CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set."],
            errors=["not configured"],
        )

    start_iso, end_iso = _window_to_datetimes(date_window)
    variables: dict[str, Any] = {
        "start": start_iso,
        "end": end_iso,
        "limit": max(1, int(row_limit)),
    }

    if config.cloudflare_zone_id:
        query = ZONE_QUERY
        variables["zoneTag"] = config.cloudflare_zone_id
    else:
        query = ACCOUNT_QUERY
        variables["accountTag"] = config.cloudflare_account_id

    payload = _post_graphql(str(config.cloudflare_api_token), query, variables)
    viewer = payload.get("data", {}).get("viewer", {})

    if config.cloudflare_zone_id:
        entities = viewer.get("zones") or []
    else:
        entities = viewer.get("accounts") or []

    if not entities:
        raise RuntimeError("Cloudflare GraphQL returned no matching zone/account rows")

    entity = entities[0]

    totals_group = (entity.get("totals") or [{}])[0]
    totals_sum = totals_group.get("sum") or {}
    requests_total = _to_float(totals_sum.get("requests"))
    bytes_total = _to_float(totals_sum.get("bytes"))

    status_group_rows = entity.get("statusGroups") or []
    status_buckets: dict[str, float] = {}
    status_rows: list[dict[str, object]] = []
    for row in status_group_rows:
        dimensions = row.get("dimensions") or {}
        status_code = int(_to_float(dimensions.get("edgeResponseStatus")))
        requests_count = _to_float((row.get("sum") or {}).get("requests"))
        bucket = _group_status(status_code)
        status_buckets[bucket] = status_buckets.get(bucket, 0.0) + requests_count

    for bucket in sorted(status_buckets.keys()):
        status_rows.append(
            {
                "kind": "status_group",
                "status_group": bucket,
                "requests": status_buckets[bucket],
            }
        )

    top_path_groups = entity.get("topPaths") or []
    path_rows: list[dict[str, object]] = []
    for row in top_path_groups:
        dimensions = row.get("dimensions") or {}
        sums = row.get("sum") or {}
        path_rows.append(
            {
                "kind": "path",
                "path": sanitize_path(str(dimensions.get("clientRequestPath") or "/")),
                "requests": _to_float(sums.get("requests")),
                "bytes": _to_float(sums.get("bytes")),
            }
        )

    path_rows.sort(key=lambda item: (-float(item.get("requests", 0)), -float(item.get("bytes", 0)), str(item.get("path", ""))))

    metrics = {
        "requests": requests_total,
        "bandwidthBytes": bytes_total,
        "errors4xx": status_buckets.get("4xx", 0.0),
        "errors5xx": status_buckets.get("5xx", 0.0),
    }

    return make_provider_result(
        provider="cloudflare",
        start=date_window.start,
        end=date_window.end,
        metrics=metrics,
        rows=sanitize_rows(path_rows + status_rows, limit=row_limit),
        notes=["source=cloudflare_graphql", "mode=zone" if config.cloudflare_zone_id else "mode=account"],
    )
