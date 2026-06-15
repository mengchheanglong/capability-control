# Hermes Verification — compact stdout cleanup

Timestamp: 2026-06-15 12:36:31 SEAST

## Verdict

PASS. The capability-core `invoke --output` path now returns compact metadata by default and does not dump full Markdown into stdout.

## Code commit

```text
89e6e26 fix: compact invoke output when writing files
```

## Changed behavior

- `--output <path>`: writes Markdown to file and omits `markdown` from stdout by default.
- `--full-output`: includes full `markdown` in stdout even when `--output` is supplied.
- No-output behavior preserves full Markdown return for small/inline usage.

## Verification commands/results

```text
pnpm test
PASS — 2 files, 10 tests

pnpm run typecheck
PASS

pnpm --silent capcore invoke markitdown --input capabilities/markitdown/fixtures/sample.html --output <tmp.md>
PASS — compact JSON keys: capabilityId, markdownChars, ok, outputPath, warnings; markdown omitted

pnpm --silent capcore invoke markitdown --input capabilities/markitdown/fixtures/sample.html --output <tmp.md> --full-output
PASS — markdown included
```

Real PDF smoke:

```text
pnpm capcore invoke markitdown --input "C:/Users/User/Social Systems/Research, Data & Thinking Tools/Social Science Research_ Principles Methods and Practices.pdf" --output "C:/Users/User/AppData/Local/Temp/capcore-real-pdf-smoke-hermes.md"
```

Result:

```text
ok: true
stdout keys: capabilityId, markdownChars, ok, outputPath, warnings
stdout has markdown key: false
stdout bytes: 531
stdout has book/title artifact: false
output bytes: 469,173
output contains Chapter 16: true
```

## Limits / notes

- Plain `pnpm capcore ... > file.json` prepends pnpm script banner lines. Use `pnpm --silent capcore ...` when capturing machine-parseable JSON.
- The original PDF text-layer artifacts remain a source-document/converter quality issue, not a stdout contract issue.
