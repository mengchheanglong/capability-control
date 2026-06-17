# Capability Control MVP

`capability-control` is a **greenfield** minimal successor experiment for capability truth and projection.
It is not a refactor of Directive Kernel.

Hermes skills are intended to be the interface. This project is the proof/contract/projection helper they consume.

The first and only capability in this MVP is `markitdown`.

## Stack

- Node.js
- TypeScript
- pnpm
- Vitest

## Commands

- Install:
  - `pnpm install`
- Run tests:
  - `pnpm test`
- Type-check:
  - `pnpm run typecheck`
- List capabilities:
  - `pnpm capcontrol list`
  - `pnpm capcontrol list` is catalog/evidence-derived and may be stale.
- Find capability:
  - `pnpm capcontrol find "convert pdf to markdown"`
- Run live-capability health checks:
  - `pnpm capcontrol health markitdown`
  - `pnpm capcontrol health` is the live truth source for agents and performs real verification.
  - Health events are appended to `outcomes/capability-events.jsonl`.
- Inspect recent shared events:
  - `pnpm --silent capcontrol events --limit 10`
- Verify (real conversion proof):
  - `pnpm capcontrol verify markitdown`
- Invoke:
  - `pnpm capcontrol invoke markitdown --input capabilities/markitdown/fixtures/sample.html`

Minimal smoke test path:
- `pnpm --silent capcontrol health markitdown`
- `pnpm --silent capcontrol invoke markitdown --input capabilities/markitdown/fixtures/sample.html --output experiments/tmp-health-smoke/sample.md`
- `pnpm --silent capcontrol events --limit 10`
- Report outcome:
  - `pnpm capcontrol report markitdown --outcome success --note "MVP smoke"`

## v1 Non-goals

- No dashboard UI.
- No old DK refactor.
- No network calls, API keys, credentials, cron jobs, auto-ingest, or MCP server.
- No second capability.
- No multi-capability orchestration beyond MarkItDown.
- `capcontrol health` is the live truth layer; `capcontrol list` is discovery/evidence status only.
- No dashboard or DK v2.
- The event ledger is append-only and provides shared session context for agents.

## If MarkItDown is missing

`capcontrol verify markitdown` will fail honestly with a clear message and will not write fake success evidence.
Other commands continue to work with injected/mocked runners for testability.
