from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

GOOGLE_SCOPE_GA4 = "https://www.googleapis.com/auth/analytics.readonly"
GOOGLE_SCOPE_GSC = "https://www.googleapis.com/auth/webmasters.readonly"
GOOGLE_SCOPE_ADSENSE = "https://www.googleapis.com/auth/adsense.readonly"


@dataclass(frozen=True)
class DateWindow:
    start: date
    end: date


@dataclass(frozen=True)
class CollectorConfig:
    ga4_property_id: str | None
    gsc_site_url: str | None
    google_oauth_client_secret_file: Path | None
    google_token_cache: Path
    cloudflare_api_token: str | None
    cloudflare_account_id: str | None
    cloudflare_zone_id: str | None
    adsense_account: str | None
    collector_timezone: str


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def load_config(env_file: str | None = None) -> CollectorConfig:
    if env_file:
        load_dotenv(env_file, override=False)
    else:
        load_dotenv(override=False)

    secret_file_raw = _clean(os.getenv("GOOGLE_OAUTH_CLIENT_SECRET_FILE"))
    token_cache_raw = _clean(os.getenv("GOOGLE_TOKEN_CACHE")) or "~/.config/geovito/tokens.json"

    return CollectorConfig(
        ga4_property_id=_clean(os.getenv("GA4_PROPERTY_ID")),
        gsc_site_url=_clean(os.getenv("GSC_SITE_URL")),
        google_oauth_client_secret_file=Path(secret_file_raw).expanduser() if secret_file_raw else None,
        google_token_cache=Path(token_cache_raw).expanduser(),
        cloudflare_api_token=_clean(os.getenv("CLOUDFLARE_API_TOKEN")),
        cloudflare_account_id=_clean(os.getenv("CLOUDFLARE_ACCOUNT_ID")),
        cloudflare_zone_id=_clean(os.getenv("CLOUDFLARE_ZONE_ID")),
        adsense_account=_clean(os.getenv("ADSENSE_ACCOUNT")),
        collector_timezone=_clean(os.getenv("COLLECTOR_TIMEZONE")) or "Europe/Istanbul",
    )


def resolve_date_window(end_date: date | None, days: int, timezone_name: str = "UTC") -> DateWindow:
    if days <= 0:
        raise ValueError("days must be >= 1")
    if end_date:
        end = end_date
    else:
        try:
            end = datetime.now(ZoneInfo(timezone_name)).date()
        except ZoneInfoNotFoundError:
            end = datetime.utcnow().date()
    start = end - timedelta(days=days - 1)
    return DateWindow(start=start, end=end)


def get_google_credentials(config: CollectorConfig, scopes: Iterable[str]) -> Credentials:
    scope_list = sorted(set(scopes))

    if not config.google_oauth_client_secret_file:
        raise RuntimeError("GOOGLE_OAUTH_CLIENT_SECRET_FILE is not configured")
    if not config.google_oauth_client_secret_file.exists():
        raise RuntimeError(f"Google OAuth client secret file not found: {config.google_oauth_client_secret_file}")

    cache_path = config.google_token_cache
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    creds: Credentials | None = None
    if cache_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(cache_path), scopes=scope_list)
        except Exception:
            creds = None

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())

    if not creds or not creds.valid or not set(scope_list).issubset(set(creds.scopes or [])):
        flow = InstalledAppFlow.from_client_secrets_file(str(config.google_oauth_client_secret_file), scopes=scope_list)
        creds = flow.run_local_server(port=0)
        cache_path.write_text(creds.to_json(), encoding="utf-8")

    return creds
