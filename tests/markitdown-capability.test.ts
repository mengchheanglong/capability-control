import { cpSync, existsSync, mkdirSync, mkdtempSync, rmdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendOutcome } from "../src/outcome.js";
import { invokeCapability } from "../src/invoke.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-control-markitdown-"));
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
    expect(result.failureCode).toBe("none");
    expect(result.markdown).toContain("Sample");
    expect(result.markdown).toContain("Hello capability core.");
    expect(result.markdownChars).toBeGreaterThan(0);
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
    expect(result.failureCode).toBe("none");
    expect(result.markdown).toBeUndefined();
    expect(result.markdownChars).toBeGreaterThan(0);
    expect(existsSync(outputFile)).toBe(true);
    expect(observedInput).not.toBe(input);
    expect(readFileSync(outputFile, "utf8")).toContain("Inline content.");
  });

  it("returns compact output when output is supplied unless full-output is requested", async () => {
    const outputFile = join(tempRoot, "out.md");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html"),
      inputKind: "path",
      outputPath: outputFile,
      runner: () => ({
        exitCode: 0,
        stdout: "# Sample\nHello capability core.",
        stderr: "",
      }),
      fullOutput: true,
    });

    expect(result.ok).toBe(true);
    expect(result.failureCode).toBe("none");
    expect(result.markdown).toContain("Sample");
    expect(result.markdown).toContain("Hello capability core.");
    expect(result.outputPath).toBe(resolve(outputFile));
    expect(result.markdownChars).toBeGreaterThan(0);
  });

  it("rejects invalid inputKind", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "definitely-invalid" as "path",
      runner: () => ({
        exitCode: 0,
        stdout: "# Sample\nHello capability core.",
        stderr: "",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("input_invalid");
    expect(result.error).toContain("inputKind");
  });

  it("rejects output that is outside project root", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const outsideOutput = join(dirname(tempRoot), "outside.md");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      outputPath: "../outside.md",
      runner: () => ({
        exitCode: 0,
        stdout: "# Sample\nHello capability core.",
        stderr: "",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("path_policy_violation");
    expect(result.error).toContain("outputPath");
    expect(existsSync(outsideOutput)).toBe(false);
  });

  it("allows output paths nested inside project root", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const outputPath = join("nested", "inside", "out.md");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      outputPath,
      runner: () => ({
        exitCode: 0,
        stdout: "# Sample\nHello capability core.",
        stderr: "",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.failureCode).toBe("none");
    expect(result.outputPath).toBe(resolve(tempRoot, outputPath));
    expect(existsSync(result.outputPath!)).toBe(true);
    expect(readFileSync(result.outputPath!, "utf8")).toContain("Sample");
  });

  it("rejects fake successful output with no markdown signal", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      runner: () => ({
        exitCode: 0,
        stdout: "GARBAGE_NOT_MARKDOWN_OR_SOURCE_CONTENT",
        stderr: "",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("output_invalid");
    expect(result.error).toContain("markdown");
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
    expect(result.failureCode).toBe("tool_missing");
    expect(result.error).toContain("markitdown not found");
  });

  it("returns timeout when runner reports timeout", async () => {
    const sample = join(tempRoot, "capabilities", "markitdown", "fixtures", "sample.html");
    const result = await invokeCapability(tempRoot, "markitdown", {
      input: sample,
      inputKind: "path",
      runner: () => ({
        exitCode: 124,
        stdout: "",
        stderr: "command timed out",
        timedOut: true,
        failureCode: "timeout",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("timeout");
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("command timed out");
  });
});
