from __future__ import annotations

import json
import re
from urllib.parse import urlparse

EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\b(?:\+?\d[\d().\-\s]{7,}\d)\b")

SENSITIVE_KEYS = {
    "user",
    "userid",
    "user_id",
    "clientid",
    "client_id",
    "session",
    "sessionid",
    "session_id",
    "email",
    "phone",
    "ip",
    "ipaddress",
    "cookie",
    "cookies",
    "token",
    "auth",
    "authorization",
    "password",
    "passwd",
    "referrer",
    "full_referrer",
}
SENSITIVE_KEYS_NORMALIZED = {re.sub(r"[^a-z0-9]", "", item) for item in SENSITIVE_KEYS}


def redact_pii(text: str) -> str:
    return PHONE_PATTERN.sub("[redacted-phone]", EMAIL_PATTERN.sub("[redacted-email]", text))


def truncate_text(text: str, limit: int) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[:limit].rstrip()


def sanitize_query(value: str, limit: int = 120) -> str:
    return truncate_text(redact_pii(value), limit=limit)


def sanitize_path(value: str) -> str:
    if not value:
        return "/"

    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        path = parsed.path or "/"
    else:
        path = value.split("?", 1)[0].split("#", 1)[0]

    if not path:
        return "/"
    if not path.startswith("/"):
        path = f"/{path}"

    collapsed = re.sub(r"/{2,}", "/", path)
    return collapsed or "/"


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().strip()
    normalized = re.sub(r"[^a-z0-9]", "", lowered)
    return lowered in SENSITIVE_KEYS or normalized in SENSITIVE_KEYS_NORMALIZED


def sanitize_row(row: dict[str, object]) -> dict[str, object]:
    sanitized: dict[str, object] = {}

    for key, raw_value in row.items():
        if _is_sensitive_key(key):
            continue
        if raw_value is None:
            continue

        key_lower = key.lower()

        if isinstance(raw_value, bool):
            sanitized[key] = raw_value
            continue

        if isinstance(raw_value, (int, float)):
            sanitized[key] = raw_value
            continue

        if isinstance(raw_value, str):
            if "query" in key_lower:
                value = sanitize_query(raw_value)
            elif key_lower in {"path", "page", "url"} or "page" in key_lower or key_lower.endswith("path"):
                value = sanitize_path(raw_value)
            elif "referrer" in key_lower:
                continue
            else:
                value = truncate_text(redact_pii(raw_value), limit=120)

            if value:
                sanitized[key] = value
            continue

        # Keep output strictly scalar for long-term compatibility.
        continue

    return {k: sanitized[k] for k in sorted(sanitized.keys())}


def sanitize_rows(rows: list[dict[str, object]], limit: int = 50) -> list[dict[str, object]]:
    cleaned: list[dict[str, object]] = []
    seen: set[str] = set()

    for row in rows:
        item = sanitize_row(row)
        if not item:
            continue
        fingerprint = json.dumps(item, sort_keys=True, ensure_ascii=False)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        cleaned.append(item)
        if len(cleaned) >= limit:
            break

    return cleaned
