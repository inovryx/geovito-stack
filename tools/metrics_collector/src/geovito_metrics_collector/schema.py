from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ProviderName = Literal["ga4", "gsc", "cloudflare", "adsense"]
SUPPORTED_PROVIDERS: tuple[ProviderName, ...] = ("ga4", "gsc", "cloudflare", "adsense")


class DateRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: date
    end: date


class ProviderResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ProviderName
    date_range: DateRange
    generated_at: datetime
    metrics: dict[str, float] = Field(default_factory=dict)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class SummaryProviderSlice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ProviderName
    metrics: dict[str, float] = Field(default_factory=dict)
    row_count: int = 0
    errors: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SummaryResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_at: datetime
    date_range: DateRange
    providers: list[SummaryProviderSlice] = Field(default_factory=list)
    kpis: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def make_provider_result(
    provider: ProviderName,
    start: date,
    end: date,
    metrics: dict[str, float] | None = None,
    rows: list[dict[str, Any]] | None = None,
    notes: list[str] | None = None,
    errors: list[str] | None = None,
) -> ProviderResult:
    return ProviderResult(
        provider=provider,
        date_range=DateRange(start=start, end=end),
        generated_at=utc_now(),
        metrics=metrics or {},
        rows=rows or [],
        notes=notes or [],
        errors=errors or [],
    )


def provider_slice(result: ProviderResult) -> SummaryProviderSlice:
    return SummaryProviderSlice(
        provider=result.provider,
        metrics=result.metrics,
        row_count=len(result.rows),
        errors=result.errors,
        notes=result.notes,
    )
