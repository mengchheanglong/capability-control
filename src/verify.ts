import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { getBasePaths, loadCapabilityManifestById } from "./registry.js";
import { EvidenceRecord, VerifyResult } from "./types.js";

export interface VerifyOptions {
  fixturePath?: string;
  runner?: (command: string, args: string[]) => { exitCode: number; stdout: string; stderr: string };
}

const DEFAULT_FIXTURE = "capabilities/markitdown/fixtures/sample.html";

function defaultRunner(command: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      const fallback = spawnSync("py", ["-m", "markitdown", ...args], {
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!fallback.error) {
        return {
          exitCode: fallback.status ?? 0,
          stdout: fallback.stdout?.toString() ?? "",
          stderr: fallback.stderr?.toString() ?? "",
        };
      }
      return {
        exitCode: 127,
        stdout: "",
        stderr: `command not found: ${command}; fallback py -m markitdown also unavailable. Install markitdown and ensure it is on PATH.`,
      };
    }
    return { exitCode: 1, stdout: "", stderr: error.message };
  }

  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

function preview(value: string, max = 2048): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function buildEvidence(
  capabilityId: string,
  command: string,
  fixturePath: string,
  exitCode: number,
  markdown: string,
  stderr: string,
  durationMs: number,
  assertions: { name: string; ok: boolean }[],
): EvidenceRecord {
  return {
    schemaVersion: 1,
    capabilityId,
    verifiedAt: new Date().toISOString(),
    runner: {
      kind: "local_command",
      command,
    },
    inputFixture: fixturePath,
    exitCode,
    ok: exitCode === 0 && assertions.every((assertion) => assertion.ok),
    assertions,
    stdoutPreview: preview(markdown),
    stderrPreview: preview(stderr),
    durationMs,
  };
}

export function verifyCapability(baseDir: string, capabilityId: string, options?: VerifyOptions): VerifyResult {
  const { baseDir: root } = getBasePaths(baseDir);
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  const fixturePath = resolve(root, options?.fixturePath ?? DEFAULT_FIXTURE);
  if (!existsSync(fixturePath)) {
    return {
      ok: false,
      capabilityId,
      error: `fixture missing: ${fixturePath}`,
    };
  }

  const args = manifest.runtime.args.map((arg) => (arg === "{input}" ? fixturePath : arg));
  const start = Date.now();
  const runner = options?.runner ?? defaultRunner;
  const result = runner(manifest.runtime.command, args);
  const durationMs = Date.now() - start;
  const markdown = result.stdout;

  const assertions = [
    {
      name: "contains_markdown_heading",
      ok: /(^|\n)\s*#\s*sample\b/i.test(markdown),
    },
    {
      name: "non_empty_output",
      ok: markdown.includes("Hello capability core.") && markdown.trim().length > 0,
    },
  ];

  const allOk = result.exitCode === 0 && assertions.every((assertion) => assertion.ok);
  if (!allOk) {
    return {
      ok: false,
      capabilityId,
      error: result.stderr || "verification checks failed",
    };
  }

  const evidence: EvidenceRecord = buildEvidence(
    manifest.id,
    manifest.runtime.command,
    "capabilities/markitdown/fixtures/sample.html",
    result.exitCode,
    markdown,
    result.stderr,
    durationMs,
    assertions,
  );

  const evidenceDir = join(root, "evidence", manifest.id);
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

  return {
    ok: true,
    capabilityId,
    evidencePath,
  };
}
