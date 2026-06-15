# Handoff — capability-core invoke output verbosity cleanup

Actor: Codex if user launches.

## Goal

Fix capability-core so real-document MarkItDown invocation is safe for Hermes context.

Currently this command writes the Markdown file correctly, but also prints the entire Markdown payload in JSON stdout:

```bash
pnpm capcore invoke markitdown --input "C:/path/to/document.pdf" --output "C:/path/to/document.md"
```

For real PDFs, this floods Hermes context. When `--output` is supplied, stdout should be compact by default.

## Repo

```text
C:/Users/User/AppData/Local/hermes/systems/capability-core
```

Current HEAD before this `.hermes` state setup:

```text
67ab314 chore: record MarkItDown skill smoke outcome
```

## Evidence

Real PDF smoke:

```text
Source: C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf
User MD: C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.md
Hermes repro: ok=true, 49.841s, output identical to user MD, 5,807 lines / 469,173 bytes
```

Report:

```text
.hermes/evaluations/real-pdf-smoke-2026-06-15.md
```

## Required behavior

1. Preserve existing conversion behavior and output file writing.
2. When `--output` is supplied, default stdout should include compact metadata only, e.g.:

```json
{
  "ok": true,
  "capabilityId": "markitdown",
  "outputPath": "...",
  "markdownChars": 469173,
  "warnings": []
}
```

3. Do not include the full `markdown` field in stdout when `--output` is supplied, unless a deliberate explicit flag is added for full output.
4. Keep no-output behavior useful for small/inline usage.
5. Add or update tests for both output and no-output cases.

## Required verification

Run from capability-core repo:

```bash
pnpm test
pnpm run typecheck
pnpm capcore invoke markitdown --input "C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf" --output "C:/Users/User/AppData/Local/Temp/capcore-real-pdf-smoke.md"
```

For the real PDF command, verify:

- command succeeds
- output Markdown file exists and is non-empty
- stdout is compact and does not contain the book text / full markdown payload

## Boundaries

Do not add MCP server, dashboard, second capability, DK refactor, auto-ingest, or broad architecture changes.
