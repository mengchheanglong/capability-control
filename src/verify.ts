import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { getBasePaths, loadCapabilityManifestById } from "./registry.js";
import { EvidenceRecord, FailureCode, VerifyResult } from "./types.js";
import { CommandResult, DEFAULT_COMMAND_TIMEOUT_MS, classifyFailureCode } from "./failures.js";

export interface VerifyOptions {
  fixturePath?: string;
  runner?: (command: string, args: string[]) => CommandResult;
}

const DEFAULT_FIXTURE = "capabilities/markitdown/fixtures/sample.html";

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: DEFAULT_COMMAND_TIMEOUT_MS,
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    if (error.code === "ETIMEDOUT") {
      return {
        exitCode: 124,
        stdout: "",
        stderr: `command timed out after ${DEFAULT_COMMAND_TIMEOUT_MS}ms`,
        timedOut: true,
        failureCode: "timeout",
      };
    }

    if (error.code === "ENOENT") {
      return {
        exitCode: 127,
        stdout: "",
        stderr: `command not found: ${command}`,
        failureCode: "tool_missing",
      };
    }

    return {
      exitCode: 1,
      stdout: "",
      stderr: error.message,
      failureCode: "command_failed",
    };
  }

  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

function defaultRunner(command: string, args: string[]): CommandResult {
  const primary = runCommand(command, args);
  if (primary.failureCode !== "tool_missing") {
    return primary;
  }

  const fallback = runCommand("py", ["-m", "markitdown", ...args]);
  if (fallback.failureCode === "tool_missing") {
    return {
      exitCode: 127,
      stdout: "",
      stderr: `command not found: ${command}; fallback py -m markitdown also unavailable. Install markitdown and ensure it is on PATH.`,
      failureCode: "tool_missing",
    };
  }

  return fallback;
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

function classifyVerifyFailure(args: {
  result: CommandResult;
  verificationFailed: boolean;
}): FailureCode {
  return classifyFailureCode({
    verificationFailed: args.verificationFailed,
    exitCode: args.result.exitCode,
    timedOut: args.result.timedOut ?? false,
    runnerFailureCode: args.result.failureCode,
    errorMessage: args.result.stderr,
  });
}

export function verifyCapability(baseDir: string, capabilityId: string, options?: VerifyOptions): VerifyResult {
  const { baseDir: root } = getBasePaths(baseDir);
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  const fixturePath = resolve(root, options?.fixturePath ?? DEFAULT_FIXTURE);
  if (!existsSync(fixturePath)) {
    return {
      ok: false,
      capabilityId,
      failureCode: "fixture_missing",
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
      ok: /(^|\n)\s*#\s+\S+/m.test(markdown),
    },
    {
      name: "non_empty_output",
      ok: markdown.includes("Hello capability core.") && markdown.trim().length > 0,
    },
  ];
  const verificationPassed = assertions.every((assertion) => assertion.ok);

  if (result.exitCode !== 0 || !verificationPassed) {
    const failureCode = classifyVerifyFailure({
      result,
      verificationFailed: !verificationPassed,
    });

    return {
      ok: false,
      capabilityId,
      failureCode,
      error: failureCode === "timeout"
        ? result.stderr || "command timed out"
        : result.stderr || "verification checks failed",
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
    failureCode: "none",
    evidencePath,
  };
}
