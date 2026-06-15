# Capability Core MVP

`capability-core` is a **greenfield** minimal successor experiment for capability truth and projection.
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
  - `pnpm capcore list`
- Find capability:
  - `pnpm capcore find "convert pdf to markdown"`
- Verify (real conversion proof):
  - `pnpm capcore verify markitdown`
- Invoke:
  - `pnpm capcore invoke markitdown --input capabilities/markitdown/fixtures/sample.html`
- Report outcome:
  - `pnpm capcore report markitdown --outcome success --note "MVP smoke"`

## v1 Non-goals

- No dashboard UI.
- No old DK refactor.
- No network calls, API keys, credentials, cron jobs, auto-ingest, or MCP server.
- No second capability.
- No multi-capability orchestration beyond MarkItDown.

## If MarkItDown is missing

`capcore verify markitdown` will fail honestly with a clear message and will not write fake success evidence.
Other commands continue to work with injected/mocked runners for testability.

