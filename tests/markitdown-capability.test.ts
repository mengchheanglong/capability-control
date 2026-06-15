import { cpSync, existsSync, mkdirSync, mkdtempSync, rmdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendOutcome } from "../src/outcome.js";
import { invokeCapability } from "../src/invoke.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-core-markitdown-"));
  mkdirSync(join(root, "capabilities", "markitdown", "fixtures"), { recursive: true });
  cpSync(join(repoRoot, "capabilities", "markitdown"), join(root, "capabilities", "markitdown"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  mkdirSync(join(root, "outcomes"), { recursive: true });
  return root;
}

describe("markitdown capability", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
  });

  it("converts sample fixture using mocked runner", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      runner: () => ({
        exitCode: 0,
        stdout: "# Sample\nHello capability core.",
        stderr: "",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("Sample");
    expect(result.markdown).toContain("Hello capability core.");
  });

  it("invokes with inline input via temporary file", async () => {
    const outputFile = join(tempRoot, "out.md");
    const input = "<h1>Sample Inline</h1><p>Inline content.</p>";
    let observedInput = "";
    const runner = (command: string, args: string[]) => {
      observedInput = args[0];
      return {
        exitCode: 0,
        stdout: "# Sample Inline\nInline content.",
        stderr: "",
      };
    };

    const result = await invokeCapability(tempRoot, "markitdown", {
      input,
      inputKind: "inline",
      outputPath: outputFile,
      runner,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(outputFile)).toBe(true);
    expect(observedInput).not.toBe(input);
    expect(readFileSync(outputFile, "utf8")).toContain("Inline content.");
  });

  it("appends outcome shape", () => {
    const path = appendOutcome(tempRoot, "markitdown", {
      outcome: "success",
      note: "MVP smoke",
    });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0]);
    expect(record.schemaVersion).toBe(1);
    expect(record.capabilityId).toBe("markitdown");
    expect(record.outcome).toBe("success");
    expect(record.note).toBe("MVP smoke");
    expect(record.source).toBe("operator");
  });

  it("returns ok false when command fails", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      runner: () => ({
        exitCode: 1,
        stdout: "",
        stderr: "markitdown not found",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("markitdown not found");
  });
});
