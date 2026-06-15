# Real PDF Smoke — capability-core MarkItDown

Timestamp: 2026-06-15 12:16:32 SEAST
Actor: Hermes verifier, after user reported quick real-document test

## Source and result

Source PDF:

```text
C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf
```

User Markdown result:

```text
C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.md
```

## Observed file stats

```text
PDF bytes: 2,115,821
MD lines/bytes: 5,807 lines / 469,173 bytes
```

## Repro check

Hermes reran capability-core MarkItDown against the same PDF to a temporary check output.

```text
pnpm capcore invoke markitdown --input <pdf> --output <capcore-check.md>
```

Result:

```text
ok: true
elapsed: 49.841 seconds
check output: 5,807 lines / 469,173 bytes
compare with user MD: identical
markers present: Chapter 1, Chapter 16, Appendix
```

## Quality notes

- Real document path works end-to-end.
- Conversion was fast enough for normal use on a 2.0 MB / textbook-style PDF.
- The Markdown is usable for LLM reading/summarization.
- The first title/metadata page has duplicated-character OCR/text-layer artifacts such as `UUnniivveerrssiittyy`; later body text is substantially cleaner.
- Tables remain lossy/mangled as expected for PDF-to-Markdown.

## Operational issue discovered

Even when `--output` is provided, capability-core `invoke` still prints the full Markdown in the JSON response. That caused unnecessary context bloat and contradicts the intended large-file workflow.

The Hermes `markitdown` skill was patched with a workaround: redirect capability-core stdout to a sidecar JSON file and inspect only metadata. Recommended code cleanup is to make capability-core print compact metadata by default when `--output` is supplied.
