from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from .schema import ProviderResult, SummaryResult, provider_slice, utc_now


def build_summary(provider_results: list[ProviderResult]) -> SummaryResult:
    if not provider_results:
        raise ValueError("provider_results cannot be empty")

    start = min(result.date_range.start for result in provider_results)
    end = max(result.date_range.end for result in provider_results)

    warnings: list[str] = []
    for result in provider_results:
        if result.errors:
            warnings.append(f"{result.provider}: {', '.join(result.errors)}")

    by_provider = {result.provider: result for result in provider_results}

    ga4_metrics = by_provider["ga4"].metrics if "ga4" in by_provider else {}
    gsc_metrics = by_provider["gsc"].metrics if "gsc" in by_provider else {}
    cf_metrics = by_provider["cloudflare"].metrics if "cloudflare" in by_provider else {}
    ads_metrics = by_provider["adsense"].metrics if "adsense" in by_provider else {}

    kpis = {
        "sessions_7d": float(ga4_metrics.get("sessions", 0.0)),
        "active_users_7d": float(ga4_metrics.get("activeUsers", 0.0)),
        "pageviews_7d": float(ga4_metrics.get("screenPageViews", ga4_metrics.get("pageViews", 0.0))),
        "clicks_7d": float(gsc_metrics.get("clicks", 0.0)),
        "impressions_7d": float(gsc_metrics.get("impressions", 0.0)),
        "cf_requests_7d": float(cf_metrics.get("requests", 0.0)),
        "cf_bandwidth_bytes_7d": float(cf_metrics.get("bandwidthBytes", 0.0)),
        "cf_4xx_7d": float(cf_metrics.get("errors4xx", 0.0)),
        "cf_5xx_7d": float(cf_metrics.get("errors5xx", 0.0)),
        "earnings_7d": float(ads_metrics.get("estimatedEarnings", 0.0)),
        "ads_impressions_7d": float(ads_metrics.get("impressions", 0.0)),
        "ads_rpm_avg_7d": float(ads_metrics.get("pageViewsRpm", 0.0)),
    }

    return SummaryResult(
        generated_at=utc_now(),
        date_range={"start": start, "end": end},
        providers=[provider_slice(result) for result in provider_results],
        kpis=kpis,
        warnings=warnings,
    )


def _to_json_bytes(payload: dict, pretty: bool) -> bytes:
    if pretty:
        text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    else:
        text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def write_results(
    out_root: Path,
    target_date: date,
    provider_results: list[ProviderResult],
    summary: SummaryResult,
    pretty: bool = False,
) -> Path:
    output_dir = out_root / target_date.isoformat()
    output_dir.mkdir(parents=True, exist_ok=True)

    for result in provider_results:
        file_path = output_dir / f"{result.provider}.json"
        file_path.write_bytes(_to_json_bytes(result.model_dump(mode="json"), pretty=pretty))

    summary_path = output_dir / "summary.json"
    summary_path.write_bytes(_to_json_bytes(summary.model_dump(mode="json"), pretty=pretty))
    return output_dir
