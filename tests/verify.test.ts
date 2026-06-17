import { cpSync, mkdirSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCapability } from "../src/verify.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-control-verify-"));
  mkdirSync(join(root, "capabilities", "markitdown", "fixtures"), { recursive: true });
  cpSync(join(repoRoot, "capabilities", "markitdown"), join(root, "capabilities", "markitdown"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  return root;
}

describe("verify capability", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
  });

  it("returns timeout failure when runner signals timeout", () => {
    const result = verifyCapability(tempRoot, "markitdown", {
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
    expect(result.error).toContain("timed out");
  });

  it("returns command-failed when runner exits non-zero", () => {
    const result = verifyCapability(tempRoot, "markitdown", {
      runner: () => ({
        exitCode: 1,
        stdout: "",
        stderr: "command execution failed",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("command_failed");
    expect(result.error).toContain("command execution failed");
  });

  it("returns fixture_missing for missing sample fixture", () => {
    const result = verifyCapability(tempRoot, "markitdown", {
      fixturePath: "capabilities/markitdown/fixtures/missing.html",
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("fixture_missing");
  });
});
