# Decisions

## 2026-06-15
Decision: Use greenfield `capability-core` instead of refactoring old DK for the surviving verified-capability core.
Rationale: The surviving product is much smaller than old DK: verified capability truth under skills. Refactoring old DK would pay for old pipeline/dashboard/Architecture ceremony.
Consequence: Old DK is donor/reference material. `capability-core` owns its own code and now its own `.hermes` active state.
Approved by: user direction + Hermes cost-aware analysis

## 2026-06-15
Decision: MarkItDown is the first vertical slice.
Rationale: It gives immediate value for PDF/document ingestion and tests the minimal loop: manifest, schema, verify, find, invoke, report outcome.
Consequence: capability-core MVP was implemented, verified, skill-integrated, and pushed to GitHub.
Approved by: user-approved Codex launch + Hermes verification

## 2026-06-15
Decision: Route Hermes MarkItDown through capability-core first.
Rationale: capability-core MVP is locally verified with real MarkItDown evidence.
Consequence: Hermes `markitdown` skill now prefers capability-core, with DK projection fallback and direct Python fallback only.
Approved by: user direction + Hermes smoke verification

## 2026-06-15
Decision: Treat the real PDF MarkItDown smoke as passed, but queue a compact-stdout cleanup.
Rationale: User confirmed the source PDF and Markdown result. Hermes reproduced the conversion through capability-core in 49.841 seconds; the output matched the user's Markdown exactly and contained Chapter 1, Chapter 16, and Appendix markers. The smoke also showed `invoke --output` still prints the full Markdown payload in JSON stdout, causing context bloat.
Consequence: Real-document MarkItDown usage is validated. The Hermes `markitdown` skill has a stdout-redirection workaround. Next bounded implementation action is a Codex cleanup so `--output` returns compact metadata by default instead of full Markdown.
Approved by: user real-document test + Hermes verification

## 2026-06-15
Decision: Create project-local `.hermes` state for capability-core.
Rationale: User corrected that capability-core should have its own active memory rather than continuing to use old DK `.hermes` for capability-core work.
Consequence: `C:/Users/User/AppData/Local/hermes/systems/capability-core/.hermes/` is now the authoritative active-memory folder for capability-core.
Approved by: user correction
