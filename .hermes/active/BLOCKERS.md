# Blockers / Attention Items

No hard blocker.

## Attention

Real PDF smoke passed, but capability-core currently prints the full Markdown payload to stdout even when `--output` is provided. This causes Hermes context bloat.

Workaround already patched into Hermes `markitdown` skill: redirect stdout to a sidecar JSON file and inspect only metadata.

Recommended cleanup: update capability-core `invoke` output contract so `--output` returns compact metadata by default.
