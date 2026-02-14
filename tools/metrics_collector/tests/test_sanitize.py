from geovito_metrics_collector.sanitize import sanitize_path, sanitize_query, sanitize_row, sanitize_rows


def test_sanitize_path_strips_host_query_and_hash() -> None:
    assert sanitize_path("https://geovito.com/en/search/?q=rome#hero") == "/en/search/"


def test_sanitize_path_keeps_plain_path() -> None:
    assert sanitize_path("en/atlas/istanbul?utm=1") == "/en/atlas/istanbul"


def test_sanitize_query_truncates_and_redacts() -> None:
    value = sanitize_query("hello user@example.com +1 (555) 123-4567 " + "x" * 200)
    assert "@" not in value
    assert "[redacted-email]" in value
    assert "[redacted-phone]" in value
    assert len(value) <= 120


def test_sanitize_row_drops_sensitive_fields() -> None:
    row = sanitize_row(
        {
            "page": "https://geovito.com/en/blog/post?utm=1",
            "query": "best cafes in kadikoy",
            "email": "user@example.com",
            "ip_address": "1.1.1.1",
            "clicks": 12,
        }
    )
    assert row["page"] == "/en/blog/post"
    assert row["query"] == "best cafes in kadikoy"
    assert "email" not in row
    assert "ip_address" not in row


def test_sanitize_rows_deduplicates_and_limits() -> None:
    rows = [
        {"page": "/en/a", "sessions": 10},
        {"page": "/en/a", "sessions": 10},
        {"page": "/en/b", "sessions": 9},
    ]
    cleaned = sanitize_rows(rows, limit=1)
    assert cleaned == [{"page": "/en/a", "sessions": 10}]
