# Next Action

Actor: **User / Hermes when a real document or next capability need appears**

Primary next action:

```text
Use capability-core MarkItDown on the next real document, or add the next capability only when a real workflow needs it.
```

Current status:

```text
The compact stdout cleanup is complete. `pnpm --silent capcore invoke markitdown --input <file> --output <out.md>` now returns compact metadata by default and does not dump the full Markdown payload.
```

Do not add MCP/dashboard/second capability speculatively.
