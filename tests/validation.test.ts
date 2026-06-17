import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInputKind, parseInvokeArgs, resolveOutputPath } from "../src/validation.js";

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
});
