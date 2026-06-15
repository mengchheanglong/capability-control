# Evidence

## 2026-06-15 — capability-core MarkItDown MVP baseline

Verified command stack:

```text
pnpm test                                      PASS — 2 files, 9 tests
pnpm run typecheck                            PASS
pnpm capcore list                             PASS
pnpm capcore find "convert pdf to markdown"   PASS
pnpm capcore verify markitdown                PASS — real evidence written
pnpm capcore invoke sample.html               PASS
pnpm capcore report                           PASS
```

Evidence path:

```text
C:/Users/User/AppData/Local/hermes/systems/capability-core/evidence/markitdown/2026-06-15T04-45-00-845Z.json
```

## 2026-06-15 — real PDF smoke

Source PDF:

```text
C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf
```

User Markdown result:

```text
C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.md
```

Measured result:

```text
PDF bytes: 2,115,821
MD lines/bytes: 5,807 lines / 469,173 bytes
Hermes repro via pnpm capcore invoke: ok=true
Elapsed: 49.841 seconds
Repro output compared to user MD: identical
Markers present: Chapter 1, Chapter 16, Appendix
```

Quality notes:

- Front/title metadata page has duplicated-character text-layer artifacts such as `UUnniivveerrssiittyy`.
- Body text is usable for LLM reading and summarization.
- PDF table formatting remains lossy/mangled as expected.

Operational issue found:

```text
capability-core invoke --output still prints full Markdown payload to stdout JSON.
```
