from datetime import date

import pytest
from pydantic import ValidationError

from geovito_metrics_collector.schema import ProviderResult, SummaryResult, make_provider_result
from geovito_metrics_collector.storage import build_summary


def test_provider_result_schema_valid() -> None:
    result = make_provider_result(
        provider="ga4",
        start=date(2026, 2, 1),
        end=date(2026, 2, 7),
        metrics={"sessions": 123.0},
        rows=[{"page": "/en/", "sessions": 50}],
    )
    assert result.provider == "ga4"
    assert result.metrics["sessions"] == 123.0


def test_provider_result_rejects_unknown_provider() -> None:
    with pytest.raises(ValidationError):
        ProviderResult(
            provider="unknown",
            date_range={"start": "2026-02-01", "end": "2026-02-07"},
            generated_at="2026-02-07T00:00:00Z",
            metrics={},
            rows=[],
            notes=[],
            errors=[],
        )


def test_summary_schema_valid() -> None:
    ga4 = make_provider_result(
        provider="ga4",
        start=date(2026, 2, 1),
        end=date(2026, 2, 7),
        metrics={"sessions": 100, "screenPageViews": 240},
    )
    gsc = make_provider_result(
        provider="gsc",
        start=date(2026, 2, 1),
        end=date(2026, 2, 7),
        metrics={"clicks": 42, "impressions": 1400},
    )

    summary = build_summary([ga4, gsc])
    assert isinstance(summary, SummaryResult)
    assert summary.kpis["sessions_7d"] == 100
    assert summary.kpis["clicks_7d"] == 42
