import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { getBasePaths, loadCapabilityManifestById } from "./registry.js";
import { EvidenceRecord, FailureCode, VerifyResult } from "./types.js";
import {
  CommandResult,
  DEFAULT_COMMAND_MAX_BUFFER_BYTES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  classifyFailureCode,
} from "./failures.js";
import type { CommandRunnerOptions } from "./invoke.js";

export interface VerifyOptions {
  fixturePath?: string;
  runner?: (command: string, args: string[], options?: CommandRunnerOptions) => CommandResult;
}

const DEFAULT_FIXTURE = "capabilities/markitdown/fixtures/sample.html";

function runCommand(command: string, args: string[], options?: CommandRunnerOptions): CommandResult {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxBuffer = options?.maxBuffer ?? DEFAULT_COMMAND_MAX_BUFFER_BYTES;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    maxBuffer,
    env: options?.env,
    cwd: options?.cwd,
    windowsHide: true,
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    if (error.code === "ETIMEDOUT") {
      return {
        exitCode: 124,
        stdout: "",
        stderr: `command timed out after ${timeoutMs}ms`,
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

function defaultMarkitdownRunner(command: string, args: string[], options?: CommandRunnerOptions): CommandResult {
  const primary = runCommand(command, args, options);
  if (primary.failureCode !== "tool_missing") {
    return primary;
  }

  const fallback = runCommand("py", ["-m", "markitdown", ...args], options);
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

function defaultRunner(command: string, args: string[], options?: CommandRunnerOptions): CommandResult {
  return runCommand(command, args, options);
}

function sanitizedStrixEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === "PYTHONPATH" || key === "PYTHONHOME") continue;
    if (value !== undefined) env[key] = value;
  }
  if (env.STRIX_TELEMETRY === undefined) {
    env.STRIX_TELEMETRY = "0";
  }
  return env;
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

function writeEvidence(root: string, evidence: EvidenceRecord): string {
  const evidenceDir = join(root, "evidence", evidence.capabilityId);
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
  return evidencePath;
}

function verifyMarkitdown(root: string, capabilityId: string, options?: VerifyOptions): VerifyResult {
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
  const runner = options?.runner ?? defaultMarkitdownRunner;
  const result = runner(manifest.runtime.command, args, { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS });
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

  const evidencePath = writeEvidence(root, evidence);

  return {
    ok: true,
    capabilityId,
    failureCode: "none",
    evidencePath,
  };
}

function verifyStrix(root: string, capabilityId: string, options?: VerifyOptions): VerifyResult {
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  const runner = options?.runner ?? defaultRunner;
  const start = Date.now();
  const strixEnv = sanitizedStrixEnv();
  const strixResult = runner(manifest.runtime.command, ["--version"], {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    env: strixEnv,
    cwd: root,
  });
  const uvToolDirResult = runner("uv", ["tool", "dir"], {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    cwd: root,
  });
  const uvToolDir = uvToolDirResult.stdout.trim();
  const strixPython = uvToolDir
    ? process.platform === "win32"
      ? join(uvToolDir, "strix-agent", "Scripts", "python.exe")
      : join(uvToolDir, "strix-agent", "bin", "python")
    : "";
  const dependencyScript = [
    "import importlib.metadata as m, json",
    "print(json.dumps({p: m.version(p) for p in ('openai-agents', 'openai', 'litellm')}))",
  ].join("; ");
  const dependencyResult = strixPython
    ? runner(strixPython, ["-I", "-c", dependencyScript], {
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
        env: strixEnv,
        cwd: root,
      })
    : {
        exitCode: uvToolDirResult.exitCode || 1,
        stdout: "",
        stderr: uvToolDirResult.stderr || "uv tool directory could not be resolved",
        failureCode: uvToolDirResult.failureCode ?? "command_failed" as FailureCode,
      };
  let dependencyVersions: Record<string, string> = {};
  if (dependencyResult.exitCode === 0) {
    try {
      dependencyVersions = JSON.parse(dependencyResult.stdout.trim()) as Record<string, string>;
    } catch {
      dependencyVersions = {};
    }
  }
  const dockerResult = runner("docker", ["info", "--format", "{{json .ServerVersion}}"], {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    cwd: root,
  });
  const durationMs = Date.now() - start;
  const assertions = [
    {
      name: "strix_version_1_0_4",
      ok: strixResult.exitCode === 0 && /1\.0\.4/.test(`${strixResult.stdout}\n${strixResult.stderr}`),
    },
    {
      name: "openai_agents_version_0_14_6",
      ok: dependencyResult.exitCode === 0 && dependencyVersions["openai-agents"] === "0.14.6",
    },
    {
      name: "openai_version_2_44_0",
      ok: dependencyResult.exitCode === 0 && dependencyVersions.openai === "2.44.0",
    },
    {
      name: "litellm_version_1_90_1",
      ok: dependencyResult.exitCode === 0 && dependencyVersions.litellm === "1.90.1",
    },
    {
      name: "docker_daemon_reachable",
      ok: dockerResult.exitCode === 0 && dockerResult.stdout.trim().length + dockerResult.stderr.trim().length > 0,
    },
  ];
  const verificationPassed = assertions.every((assertion) => assertion.ok);
  const stdout = [
    `strix --version: ${strixResult.stdout.trim() || strixResult.stderr.trim()}`,
    `strix runtime dependencies: ${dependencyResult.stdout.trim() || dependencyResult.stderr.trim()}`,
    `docker info: ${dockerResult.stdout.trim() || dockerResult.stderr.trim()}`,
  ].join("\n");
  const stderr = [strixResult.stderr, uvToolDirResult.stderr, dependencyResult.stderr, dockerResult.stderr]
    .filter(Boolean)
    .join("\n");

  if (!verificationPassed) {
    const failed = !assertions[0].ok
      ? strixResult
      : !assertions[1].ok || !assertions[2].ok || !assertions[3].ok
        ? dependencyResult
        : dockerResult;
    const failureCode = classifyVerifyFailure({
      result: failed,
      verificationFailed: true,
    });
    const versionSummary = JSON.stringify(dependencyVersions);
    return {
      ok: false,
      capabilityId,
      failureCode,
      error: failed.stderr || `Strix prerequisite checks failed; runtime versions: ${versionSummary}`,
    };
  }

  const evidence: EvidenceRecord = buildEvidence(
    manifest.id,
    `${manifest.runtime.command} --version && verify pinned Python dependencies && docker info`,
    "prerequisites: strix --version; pinned runtime dependencies; docker info",
    0,
    stdout,
    stderr,
    durationMs,
    assertions,
  );
  const evidencePath = writeEvidence(root, evidence);
  return {
    ok: true,
    capabilityId,
    failureCode: "none",
    evidencePath,
  };
}

export function verifyCapability(baseDir: string, capabilityId: string, options?: VerifyOptions): VerifyResult {
  const { baseDir: root } = getBasePaths(baseDir);
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  if (manifest.id === "markitdown") {
    return verifyMarkitdown(root, capabilityId, options);
  }
  if (manifest.id === "strix") {
    return verifyStrix(root, capabilityId, options);
  }

  return {
    ok: false,
    capabilityId,
    failureCode: "unsupported_input",
    error: `Unsupported capability: ${manifest.id}`,
  };
}
