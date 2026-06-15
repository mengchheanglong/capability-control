import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findCapabilities, listCapabilities, loadCapabilityManifestById } from "../src/registry.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-core-registry-"));
  mkdirSync(join(root, "capabilities", "markitdown", "fixtures"), { recursive: true });
  cpSync(join(repoRoot, "capabilities", "markitdown"), join(root, "capabilities", "markitdown"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  return root;
}

describe("registry", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
  });

  it("loads MarkItDown manifest and validates required fields", () => {
    const { manifest } = loadCapabilityManifestById(tempRoot, "markitdown");
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe("markitdown");
    expect(manifest.name).toBe("MarkItDown");
    expect(manifest.runtime.kind).toBe("local_command");
    expect(manifest.runtime.command).toBe("markitdown");
    expect(Array.isArray(manifest.whenToUse)).toBe(true);
    expect(Array.isArray(manifest.failureModes)).toBe(true);
  });

  it("computes candidate status when no evidence exists", () => {
    const list = listCapabilities(tempRoot);
    const markitdown = list.find((entry) => entry.id === "markitdown");
    expect(markitdown).toBeDefined();
    expect(markitdown?.status).toBe("candidate");
    expect(markitdown?.lastVerifiedAt).toBeNull();
  });

  it("computes verified status when valid evidence exists", () => {
    const evidenceDir = join(tempRoot, "evidence", "markitdown");
    mkdirSync(evidenceDir, { recursive: true });
    const evidencePath = join(evidenceDir, "fixture.json");
    const evidence = {
      schemaVersion: 1,
      capabilityId: "markitdown",
      verifiedAt: new Date().toISOString(),
      runner: { kind: "local_command", command: "markitdown" },
      inputFixture: "capabilities/markitdown/fixtures/sample.html",
      exitCode: 0,
      ok: true,
      assertions: [
        { name: "contains_markdown_heading", ok: true },
        { name: "non_empty_output", ok: true },
      ],
      stdoutPreview: "# Sample",
      stderrPreview: "",
      durationMs: 12,
    };
    writeFileSync(evidencePath, JSON.stringify(evidence), "utf8");

    const list = listCapabilities(tempRoot);
    const markitdown = list.find((entry) => entry.id === "markitdown");
    expect(markitdown?.status).toBe("verified");
    expect(markitdown?.lastVerifiedAt).toBeTruthy();
  });

  it("find returns MarkItDown for conversion queries", () => {
    const q1 = findCapabilities("convert pdf to markdown", tempRoot);
    expect(q1.length).toBeGreaterThan(0);
    expect(q1[0].id).toBe("markitdown");
    expect(q1[0].score).toBeGreaterThan(0);

    const q2 = findCapabilities("reduce pdf context cost", tempRoot);
    expect(q2.length).toBeGreaterThan(0);
    expect(q2[0].id).toBe("markitdown");
  });

  it("loads manifest through read path for integrity check", () => {
    const manifestPath = join(tempRoot, "capabilities", "markitdown", "manifest.json");
    const raw = readFileSync(manifestPath, "utf8");
    expect(raw.includes("MarkItDown")).toBe(true);
  });
});
