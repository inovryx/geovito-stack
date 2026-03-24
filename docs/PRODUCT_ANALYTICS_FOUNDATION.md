# Product Analytics Foundation M0

## Purpose
M0 establishes a privacy-first, vendor-agnostic analytics foundation without changing backend runtime behavior.
It keeps current UI tracking intact while adding a canonical analytics envelope for future evolution.

## Non-goals (M0)
- No backend ingest endpoint
- No persistent funnel storage
- No attribution/multi-touch model
- No cross-device identity stitching
- No invasive tracking or fingerprinting

## Canonical Event Envelope (M0)
Every emitted analytics event carries:
- `legacy_event`: current snake_case event name (compatibility)
- `event_name`: canonical dot name (`analytics.*`)
- `event_version`: `1`
- `event_ts`: ISO UTC timestamp
- `session_ref`: ephemeral per-tab pseudonymous reference
- `consent_scope`: `analytics_granted`
- `funnel_stage`: normalized funnel stage
- `props`: sanitized allowlist payload

Compatibility note:
- `event` remains present with the same legacy snake_case value.
- Existing callers (`track('search_submit', ...)`) remain unchanged.

## Canonical Naming + Legacy Alias
| legacy event | canonical event_name | funnel_stage |
| --- | --- | --- |
| `search_submit` | `analytics.search.submit` | `search_discovery` |
| `filter_chip_click` | `analytics.search.filter_chip.click` | `search_discovery` |
| `sort_change` | `analytics.search.sort.change` | `search_discovery` |
| `pagination_click` | `analytics.search.pagination.click` | `search_discovery` |
| `tool_open` | `analytics.navigation.tool.open` | `navigation_interaction` |
| `nav_click` | `analytics.navigation.item.click` | `navigation_interaction` |
| `ad_slot_view` | `analytics.ad.slot.view` | `ads_visibility` |
| `theme_toggle` | `analytics.ui.theme.toggle` | `ui_preferences` |
| `sidebar_toggle` | `analytics.ui.sidebar.toggle` | `ui_preferences` |

## Session Model
- Storage key: `sessionStorage['gv.analytics.session_ref.v1']`
- Format: `sess_<random>`
- Lifecycle: stable within one tab session, reset when tab session ends
- Fallback: in-memory reference when sessionStorage is not available

## Privacy Guardrails
- Emit requires analytics consent (`data-consent-analytics=1` or consent state true)
- No network ingest in M0; provider dispatch only (`console`, `datalayer`, `custom event`)
- PII-sensitive keys are blocked at sanitization allowlist stage
- String payloads are redacted for email and phone patterns
- No user identity derivation is added (`identify` remains no-op placeholder)

## Provider Behavior
- `datalayer`: pushes compatibility + canonical envelope fields in same payload
- `console`: logs compatibility event with full envelope
- `custom`: emits `gv:analytics` with the canonical envelope in `detail`

## Related Docs
- `docs/METADATA_REGISTRY.md`
- `docs/EVENT_NAMING.md`
- `docs/PII_POLICY.md`
- `docs/LOGGING_GUIDE.md`
