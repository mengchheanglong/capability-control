import { describe, expect, it } from "vitest";
import { classifyFailureCode } from "../src/failures.js";

describe("failure code classifier", () => {
  it("maps input invalid flags", () => {
    expect(classifyFailureCode({ inputInvalid: true })).toBe("input_invalid");
  });

  it("maps timeout signals", () => {
    expect(classifyFailureCode({ timedOut: true })).toBe("timeout");
  });

  it("maps explicit runner codes", () => {
    expect(classifyFailureCode({ runnerFailureCode: "tool_missing" })).toBe("tool_missing");
  });

  it("falls back to command_failed on non-zero exit code", () => {
    expect(classifyFailureCode({ exitCode: 1 })).toBe("command_failed");
  });

  it("returns none for healthy cases", () => {
    expect(classifyFailureCode({ exitCode: 0 })).toBe("none");
  });
});
