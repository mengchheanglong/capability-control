import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeInputKind,
  normalizeStrixInstruction,
  normalizeStrixScanMode,
  normalizeStrixScopeMode,
  normalizeStrixTimeoutSecondsToMs,
  parseInvokeArgs,
  resolveOutputPath,
} from "../src/validation.js";
import { DEFAULT_STRIX_TIMEOUT_MS } from "../src/failures.js";

describe("invocation validation", () => {
  it("rejects unknown invoke options", () => {
    const result = parseInvokeArgs(["--input", "sample.html", "--unexpected", "field"]);
    expect(result.error).toContain("unknown option");
    expect(result.error).toContain("--unexpected");
  });

  it("requires recognized inputKind values", () => {
    expect(() => normalizeInputKind("definitely-invalid")).toThrowError(/inputKind/);
    expect(() => normalizeInputKind("inline")).not.toThrow();
  });

  it("rejects output paths that resolve above base dir", () => {
    const root = join(process.cwd(), "capability-control-validation-root");
    expect(() => resolveOutputPath(root, "../outside.md")).toThrowError(/inside base directory/i);
  });

  it("parses Strix invoke options and converts bounded timeout seconds to milliseconds", () => {
    const result = parseInvokeArgs([
      "--input",
      "C:/repo",
      "--authorized",
      "--scan-mode",
      "standard",
      "--scope-mode",
      "diff",
      "--timeout-seconds",
      "60",
      "--instruction",
      "focus on auth flows",
    ]);

    expect(result.error).toBeNull();
    expect(result.value.authorized).toBe(true);
    expect(normalizeStrixScanMode(result.value["scan-mode"])).toBe("standard");
    expect(normalizeStrixScopeMode(result.value["scope-mode"])).toBe("diff");
    expect(normalizeStrixTimeoutSecondsToMs(result.value["timeout-seconds"])).toBe(60_000);
    expect(normalizeStrixTimeoutSecondsToMs(undefined)).toBe(DEFAULT_STRIX_TIMEOUT_MS);
    expect(normalizeStrixInstruction(result.value.instruction)).toBe("focus on auth flows");
    expect(() => normalizeStrixTimeoutSecondsToMs("59")).toThrowError(/between/);
    expect(() => normalizeStrixTimeoutSecondsToMs("60.5")).toThrowError(/integer/);
    expect(() => normalizeStrixInstruction("   ")).toThrowError(/non-empty/);
  });

  it("does not retain the public --timeout-ms invoke option", () => {
    const result = parseInvokeArgs(["--input", "C:/repo", "--timeout-ms", "60000"]);
    expect(result.error).toContain("unknown option");
    expect(result.error).toContain("--timeout-ms");
  });
});
