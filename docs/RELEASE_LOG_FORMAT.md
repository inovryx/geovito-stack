# Release Log Format

Release pipeline writes contract logs with `channel=release`.

## Producers
- `tools/go_live_gate.sh`
- `tools/go_live_gate_full.sh`

## Minimum event pattern
- start: `go_live_gate.start` / `go_live_gate_full.start`
- per-step: `go_live_gate.step` / `go_live_gate_full.step`
- summary: `go_live_gate.summary` / `go_live_gate_full.summary`

## Correlation
- `request_id` is script `RUN_ID`
- `meta.run_id` repeats the same value for parser stability
