import { cpSync, mkdirSync, mkdtempSync, rmdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { healthCheck } from "../src/health.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-control-health-"));
  mkdirSync(join(root, "capabilities", "markitdown", "fixtures"), { recursive: true });
  cpSync(join(repoRoot, "capabilities", "markitdown"), join(root, "capabilities", "markitdown"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  return root;
}

describe("health check", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
  });

  it("reports available when verify succeeds", () => {
    const result = healthCheck(tempRoot, "markitdown", {
      verify: () => ({
        ok: true,
        capabilityId: "markitdown",
        failureCode: "none",
        evidencePath: "evidence/markitdown/ok.json",
      }),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.ledgerPath).toBe(join(tempRoot, "outcomes", "capability-events.jsonl"));
    const lines = readFileSync(result.ledgerPath!, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0]);
    expect(record.schemaVersion).toBe(1);
    expect(record.recordedAt).toBeTruthy();
    expect(record.capabilityId).toBe("markitdown");
    expect(record.action).toBe("health");
    expect(record.status).toBe("available");
    expect(record.ok).toBe(true);
    expect(record.failureCode).toBe("none");
    expect(record.message).toContain("succeeded");
    expect(result.capabilities).toEqual([
      {
        id: "markitdown",
        status: "available",
        liveVerified: true,
        lastVerifiedAt: "2026-01-01T00:00:00.000Z",
        failureCode: "none",
        error: null,
        fallback: "py -m markitdown fallback is attempted when bare markitdown is missing",
      },
    ]);
  });

  it("reports unavailable when verify fails", () => {
    const result = healthCheck(tempRoot, "markitdown", {
      verify: () => ({
        ok: false,
        capabilityId: "markitdown",
        failureCode: "verification_failed",
        error: "missing command",
      }),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    expect(result.ledgerPath).toBe(join(tempRoot, "outcomes", "capability-events.jsonl"));
    const lines = readFileSync(result.ledgerPath!, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0]);
    expect(record.ok).toBe(false);
    expect(record.status).toBe("unavailable");
    expect(record.failureCode).toBe("verification_failed");
    expect(record.recordedAt).toBeTruthy();
    expect(result.capabilities).toEqual([
      {
        id: "markitdown",
        status: "unavailable",
        liveVerified: false,
        lastVerifiedAt: null,
        failureCode: "verification_failed",
        error: "missing command",
        fallback: "py -m markitdown fallback is attempted when bare markitdown is missing",
      },
    ]);
  });

  it("marks unknown for thrown health check errors", () => {
    const result = healthCheck(tempRoot, "markitdown", {
      verify: () => {
        throw new Error("No manifest for markitdown");
      },
      now: () => "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    expect(result.ledgerPath).toBe(join(tempRoot, "outcomes", "capability-events.jsonl"));
    const lines = readFileSync(result.ledgerPath!, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0]);
    expect(record.ok).toBe(false);
    expect(record.failureCode).toBe("unknown");
    expect(record.status).toBe("unavailable");
    expect(record.recordedAt).toBeTruthy();
    expect(result.capabilities).toEqual([
      {
        id: "markitdown",
        status: "unavailable",
        liveVerified: false,
        lastVerifiedAt: null,
        failureCode: "unknown",
        error: "No manifest for markitdown",
        fallback: "py -m markitdown fallback is attempted when bare markitdown is missing",
      },
    ]);
  });
});
