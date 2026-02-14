from __future__ import annotations

from typing import Callable

from ..config import CollectorConfig, DateWindow
from ..schema import ProviderName, ProviderResult, SUPPORTED_PROVIDERS
from .adsense import collect_adsense
from .cloudflare import collect_cloudflare
from .ga4 import collect_ga4
from .gsc import collect_gsc

ProviderCollector = Callable[[CollectorConfig, DateWindow, int], ProviderResult]

COLLECTORS: dict[ProviderName, ProviderCollector] = {
    "ga4": collect_ga4,
    "gsc": collect_gsc,
    "cloudflare": collect_cloudflare,
    "adsense": collect_adsense,
}

__all__ = ["COLLECTORS", "SUPPORTED_PROVIDERS", "ProviderCollector"]
