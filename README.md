# Capability Control

`capability-control` is a **greenfield** successor experiment for capability truth and projection.
It is not a refactor of Directive Kernel.

Hermes skills are intended to be the interface. This project is the proof/contract/projection helper they consume.

Current bounded capabilities:

- `markitdown`: local document/HTML-to-Markdown conversion.
- `strix`: authorized-use-only local security analysis for existing local directories.

## Stack

- Node.js
- TypeScript
- pnpm
- Vitest

## Commands

- Install:
  - `pnpm install`
- Install Strix 1.0.4 with the upstream-locked runtime versions:
  - `uv tool install --force --with 'openai-agents[litellm]==0.14.6' --with 'openai==2.44.0' --with 'litellm==1.90.1' 'strix-agent==1.0.4'`
- Run tests:
  - `pnpm test`
- Type-check:
  - `pnpm run typecheck`
- List capabilities:
  - `pnpm capcontrol list`
  - `pnpm capcontrol list` is catalog/evidence-derived and may be stale.
- Find capability:
  - `pnpm capcontrol find "convert pdf to markdown"`
  - `pnpm capcontrol find "authorized local repo security scan"`
- Run live-capability health checks:
  - `pnpm capcontrol health markitdown`
  - `pnpm capcontrol health strix`
  - `pnpm capcontrol health` is the live truth source for agents and performs real verification.
  - Health events are appended to `outcomes/capability-events.jsonl`.
- Inspect recent shared events:
  - `pnpm --silent capcontrol events --limit 10`
- Generate a lightweight `.active/` context pack for any project:
  - `pnpm --silent capcontrol brief --project-root . --focus workspace --tier overview --dry-run`
- Verify (real conversion proof):
  - `pnpm capcontrol verify markitdown`
- Verify Strix prerequisites only:
  - `pnpm capcontrol verify strix`
  - This checks `strix --version`, the exact locked versions of `openai-agents`, `openai`, and `litellm`, and Docker daemon reachability. It does not start a scan, pull images, or call an LLM.
- Invoke:
  - `pnpm capcontrol invoke markitdown --input capabilities/markitdown/fixtures/sample.html`
  - `pnpm capcontrol invoke strix --input C:\path\to\Menui --authorized --scan-mode quick --scope-mode full --instruction "focus on auth flows"`
  - Strix invocation only accepts existing local directories. URLs, domains, IPs, and inline input are rejected in this slice.
  - Strix runs non-interactively with a default 4 hour timeout. Override with `--timeout-seconds` between `60` and `86400`.
  - Optional `--instruction <text>` is passed only to Strix and must not be blank.
  - Strix is authorized-use-only. Only run it against code or systems you own or have explicit permission to assess.

Minimal smoke test path:
- `pnpm --silent capcontrol health markitdown`
- `pnpm --silent capcontrol invoke markitdown --input capabilities/markitdown/fixtures/sample.html --output experiments/tmp-health-smoke/sample.md`
- `pnpm --silent capcontrol health strix`
- `pnpm --silent capcontrol events --limit 10`
- Report outcome:
  - `pnpm capcontrol report markitdown --outcome success --note "MVP smoke"`

## v1 Non-goals

- No dashboard UI.
- No old DK refactor.
- No credentials, cron jobs, auto-ingest, or MCP server.
- No unbounded remote security probing. Strix is limited to explicit authorized local-directory scans.
- No multi-capability orchestration.
- `capcontrol health` is the live truth layer; `capcontrol list` is discovery/evidence status only.
- No dashboard or DK v2.
- The event ledger is append-only and provides shared session context for agents.

## If MarkItDown is missing

`capcontrol verify markitdown` will fail honestly with a clear message and will not write fake success evidence.
Other commands continue to work with injected/mocked runners for testability.
