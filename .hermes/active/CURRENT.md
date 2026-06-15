# Current State

Mission: Greenfield capability-core MVP
Branch: `main`
Status: **COMPACT STDOUT CLEANUP COMPLETE / VERIFIED / CODE COMMITTED**
Owner / Worker: Codex implemented; Hermes verified and committed code

## Repository

```text
C:/Users/User/AppData/Local/hermes/systems/capability-core
https://github.com/mengchheanglong/capability-core
Visibility: PRIVATE
Current code commit: 89e6e26 fix: compact invoke output when writing files
```

## What Works

The greenfield core proves:

```text
manifest → schema → verify → find → invoke → report outcome
```

MarkItDown behavior now:

```text
pnpm --silent capcore invoke markitdown --input <file> --output <out.md>
```

returns compact JSON metadata by default:

```text
ok, capabilityId, markdownChars, warnings, outputPath
```

and omits the full `markdown` field unless `--full-output` is explicitly supplied.

## Verification

Hermes verified after Codex implementation:

```text
pnpm test                         PASS — 2 files, 10 tests
pnpm run typecheck                PASS
sample --output compact JSON      PASS — no markdown field
sample --full-output              PASS — markdown field included
real PDF --output smoke           PASS — output file written, stdout 531 bytes, no book text in stdout
```

Real PDF smoke details:

```text
Source: C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf
Output: C:/Users/User/AppData/Local/Temp/capcore-real-pdf-smoke-hermes.md
stdout keys: capabilityId, markdownChars, ok, outputPath, warnings
stdout_has_book_artifact: false
output_has_chapter_16: true
```

## Skill Integration

Hermes `markitdown` skill routes:

```text
capability-core MarkItDown first → DK projection fallback → direct Python fallback only
```

The skill was patched again after this cleanup to remove the old warning/workaround and document the new compact stdout behavior.

## What Is Not Built

- No MCP server.
- No dashboard.
- No second capability.
- No old DK source refactor.

## Last Meaningful Update

- 2026-06-15 12:36:31 SEAST
- Compact stdout cleanup implemented by Codex, verified by Hermes, code committed as `89e6e26`.
