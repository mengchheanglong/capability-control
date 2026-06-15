# Current State

Mission: Greenfield capability-core MVP
Branch: `main`
Status: **REAL PDF SMOKE PASSED / PROJECT-LOCAL .hermes CREATED / CLI OUTPUT CLEANUP NEXT**
Owner / Worker: Hermes created project-local state; next implementation actor should be Codex if user launches the cleanup

## Repository

```text
C:/Users/User/AppData/Local/hermes/systems/capability-core
https://github.com/mengchheanglong/capability-core
Visibility: PRIVATE
Current HEAD before .hermes state commit: 67ab314 chore: record MarkItDown skill smoke outcome
```

## What Works

The greenfield core proves:

```text
manifest → schema → verify → find → invoke → report outcome
```

Previously verified:

```text
pnpm test                                      PASS — 2 files, 9 tests
pnpm run typecheck                            PASS
pnpm capcore list                             PASS
pnpm capcore find "convert pdf to markdown"   PASS
pnpm capcore verify markitdown                PASS — real evidence written
pnpm capcore invoke sample.html               PASS
pnpm capcore report                           PASS
git rev-list origin/main...HEAD               PASS — 0 0
git status                                    PASS — ## main...origin/main
```

Real document smoke:

```text
Source: C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf
Result: C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.md
PDF: 2,115,821 bytes
MD: 5,807 lines / 469,173 bytes
Hermes repro via pnpm capcore invoke: ok=true, 49.841s
Hermes repro output compared to user MD: identical
Markers present: Chapter 1, Chapter 16, Appendix
```

## Skill Integration

Hermes `markitdown` skill routes:

```text
capability-core MarkItDown first → DK projection fallback → direct Python fallback only
```

## Why this `.hermes` exists

User corrected that capability-core should have its own `.hermes` state rather than continuing to store active state under old DK.

This folder is now the authoritative active memory for capability-core work.

## Needs Attention

One small operational cleanup is justified by real use:

```text
capability-core invoke currently prints full Markdown in JSON stdout even when --output is supplied.
```

This causes context bloat for real documents. The Hermes `markitdown` skill has a workaround, but capability-core itself should return compact metadata by default when `--output` is used.

## Last Meaningful Update

- 2026-06-15 12:21:56 SEAST
- Project-local `.hermes` created for capability-core.
