from __future__ import annotations

from datetime import date
from pathlib import Path

import typer

from .config import load_config, resolve_date_window
from .providers import COLLECTORS
from .sanitize import sanitize_rows
from .schema import SUPPORTED_PROVIDERS, ProviderName, make_provider_result
from .storage import build_summary, write_results

app = typer.Typer(help="GeoVito metrics collector (local-first, aggregated, privacy-safe)")


@app.callback()
def app_root() -> None:
    """GeoVito metrics collector commands."""


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise typer.BadParameter("--date must be in YYYY-MM-DD format") from exc


def _parse_provider_selection(value: str | None) -> list[ProviderName]:
    if not value:
        return list(SUPPORTED_PROVIDERS)

    requested = [part.strip().lower() for part in value.split(",") if part.strip()]
    if not requested:
        return list(SUPPORTED_PROVIDERS)

    invalid = [name for name in requested if name not in SUPPORTED_PROVIDERS]
    if invalid:
        raise typer.BadParameter(f"Unknown provider(s): {', '.join(invalid)}")

    # Keep canonical order for deterministic output.
    selected: list[ProviderName] = []
    for name in SUPPORTED_PROVIDERS:
        if name in requested:
            selected.append(name)
    return selected


@app.command("run")
def run_command(
    date_value: str | None = typer.Option(None, "--date", help="End date (YYYY-MM-DD). Defaults to today."),
    days: int = typer.Option(7, "--days", min=1, help="Inclusive lookback window in days."),
    out: Path = typer.Option(Path("../../data/metrics"), "--out", help="Output root directory."),
    providers: str | None = typer.Option(None, "--providers", help="Comma-separated providers."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Run collection without writing files."),
    json_pretty: bool = typer.Option(False, "--json-pretty", help="Pretty-print output JSON files."),
    fail_soft: bool = typer.Option(False, "--fail-soft", help="Continue when provider errors occur."),
    env_file: str | None = typer.Option(None, "--env-file", help="Optional .env path for collector config."),
) -> None:
    """Collect provider metrics and write versioned JSON files."""
    config = load_config(env_file=env_file)
    date_window = resolve_date_window(_parse_date(date_value), days=days, timezone_name=config.collector_timezone)
    selected_providers = _parse_provider_selection(providers)

    typer.echo(
        f"Collecting metrics for {date_window.start.isoformat()}..{date_window.end.isoformat()} "
        f"providers={','.join(selected_providers)} dry_run={dry_run}"
    )

    provider_results = []
    fatal_errors = []

    for provider in selected_providers:
        collector = COLLECTORS[provider]
        typer.echo(f"- {provider}: start")
        try:
            result = collector(config, date_window, 50)
            result.rows = sanitize_rows(result.rows, limit=50)
            provider_results.append(result)
            if result.errors:
                typer.echo(f"  {provider}: warnings/errors -> {', '.join(result.errors)}")
            else:
                typer.echo(f"  {provider}: ok ({len(result.rows)} rows)")
        except Exception as exc:  # noqa: BLE001
            message = str(exc) or exc.__class__.__name__
            if fail_soft:
                typer.echo(f"  {provider}: failed (fail-soft) -> {message}")
                provider_results.append(
                    make_provider_result(
                        provider=provider,
                        start=date_window.start,
                        end=date_window.end,
                        notes=["provider execution failed"],
                        errors=[message],
                    )
                )
                continue

            fatal_errors.append(f"{provider}: {message}")
            break

    if fatal_errors:
        typer.echo("Collection aborted:", err=True)
        for err in fatal_errors:
            typer.echo(f"  - {err}", err=True)
        raise typer.Exit(code=1)

    summary = build_summary(provider_results)

    if dry_run:
        typer.echo("Dry-run summary:")
        typer.echo(summary.model_dump_json(indent=2, exclude_none=True))
        return

    output_dir = write_results(out_root=out, target_date=date_window.end, provider_results=provider_results, summary=summary, pretty=json_pretty)
    typer.echo(f"Wrote metrics to: {output_dir}")


if __name__ == "__main__":
    app()
