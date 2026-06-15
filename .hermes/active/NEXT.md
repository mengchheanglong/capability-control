# Next Action

Actor: **Codex, if user launches the cleanup**

Primary next action:

```text
Fix capability-core invoke output verbosity: when `pnpm capcore invoke markitdown --output <file>` is used, stdout should return compact metadata by default instead of the full Markdown payload.
```

Why this is next:

```text
The real PDF smoke passed, but Hermes reproduction showed capability-core still printed the entire converted Markdown into JSON stdout even with --output. This caused context bloat and makes the large-file workflow unsafe for normal Hermes terminal use.
```

Verification target for the cleanup:

```text
pnpm test
pnpm run typecheck
pnpm capcore invoke markitdown --input <real-pdf> --output <tmp-md>
# stdout must be compact and must not include the full markdown text
# output file must contain the converted markdown
```

Do not add MCP/dashboard/second capability speculatively.
