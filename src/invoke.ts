import { accessSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  CapabilityManifest,
  CapabilityOutput,
  FailureCode,
  MarkitdownOutput,
  StrixOutput,
  StrixScanMode,
  StrixScopeMode,
} from "./types.js";
import { getBasePaths, loadCapabilityManifestById } from "./registry.js";
import {
  isMarkdownLike,
  normalizeInputKind,
  normalizeStrixInstruction,
  normalizeStrixScanMode,
  normalizeStrixScopeMode,
  normalizeStrixTimeoutSecondsToMs,
  parseMarkitdownInput,
  resolveOutputPath,
} from "./validation.js";
import {
  CommandResult,
  DEFAULT_COMMAND_MAX_BUFFER_BYTES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  STRIX_MAX_BUFFER_BYTES,
  classifyFailureCode,
} from "./failures.js";

export interface CommandRunnerOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export type CommandRunner = (command: string, args: string[], options?: CommandRunnerOptions) => CommandResult;

export interface InvokeOptions {
  input: string;
  inputKind?: "path" | "inline";
  outputPath?: string;
  fullOutput?: boolean;
  authorized?: boolean;
  scanMode?: string;
  scopeMode?: string;
  timeoutSeconds?: number | string;
  instruction?: string;
  runner?: CommandRunner;
}

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

function defaultStrixRunner(command: string, args: string[], options?: CommandRunnerOptions): CommandResult {
  return runCommand(command, args, options);
}

function failureOutput(
  capabilityId: "markitdown",
  failureCode: FailureCode,
  error: string,
  message = "",
  timedOut = false,
): MarkitdownOutput {
  return {
    ok: false,
    capabilityId,
    markdown: "",
    markdownChars: 0,
    warnings: [message],
    failureCode,
    timedOut,
    error,
  };
}

function classifyCommandFailure(result: CommandResult): FailureCode {
  return classifyFailureCode({
    exitCode: result.exitCode,
    timedOut: result.timedOut ?? false,
    runnerFailureCode: result.failureCode,
    errorMessage: result.stderr,
  });
}

function getArgs(manifest: CapabilityManifest, inputPath: string): string[] {
  return (manifest.runtime.args ?? []).map((value) => (value === "{input}" ? inputPath : value));
}

function getStrixArgs(
  manifest: CapabilityManifest,
  target: string,
  scanMode: StrixScanMode,
  scopeMode: StrixScopeMode,
  configPath: string,
  instruction?: string,
): string[] {
  const template = manifest.runtime.args?.length
    ? manifest.runtime.args
    : ["-n", "--target", "{input}", "--scan-mode", "{scanMode}", "--scope-mode", "{scopeMode}", "--config", "{config}"];
  const args = template.map((value) => {
    if (value === "{input}" || value === "{target}") return target;
    if (value === "{scanMode}") return scanMode;
    if (value === "{scopeMode}") return scopeMode;
    if (value === "{config}") return configPath;
    return value;
  });
  if (instruction !== undefined) {
    args.push("--instruction", instruction);
  }
  return args;
}

function isUrlLike(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function isDomainLike(value: string): boolean {
  if (/[\\/]/.test(value)) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+$/i.test(value);
}

function isIpLike(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^\[[0-9a-f:]+\]$/i.test(value) || /^[0-9a-f:]*:[0-9a-f:]+$/i.test(value);
}

function preview(value: string, max = 2048): string {
  const redacted = redactSensitive(value);
  return redacted.length <= max ? redacted : `${redacted.slice(0, max)}...`;
}

function redactSensitive(value: string): string {
  let redacted = value;
  const sensitiveValues = Object.entries(process.env)
    .filter(([key, envValue]) => /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key) && typeof envValue === "string" && envValue.length >= 4)
    .map(([, envValue]) => envValue as string)
    .sort((a, b) => b.length - a.length);

  for (const secret of sensitiveValues) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }

  redacted = redacted.replace(/(LLM_API_KEY|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)(["'\s:=]+)([^"'\s,}]+)/gi, "$1$2[REDACTED]");
  redacted = redacted.replace(/(["']?(?:llm_)?api[_-]?key["']?\s*:\s*["'])([^"']+)(["'])/gi, "$1[REDACTED]$3");
  return redacted;
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

function discoverRunPath(stdout: string, stderr: string, root: string): string | undefined {
  const combined = `${stdout}\n${stderr}`;
  const match = combined.match(/(?:^|\s)(strix_runs[\\/][^\s'")]+)/i);
  return match ? resolve(root, match[1]) : undefined;
}

function strixFailureOutput(args: {
  failureCode: FailureCode;
  error: string;
  warnings?: string[];
  exitCode?: number | null;
  target?: string | null;
  scanMode?: StrixScanMode;
  scopeMode?: StrixScopeMode;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
}): StrixOutput {
  return {
    ok: false,
    capabilityId: "strix",
    completed: false,
    findingsFound: false,
    exitCode: args.exitCode ?? null,
    target: args.target ?? null,
    scanMode: args.scanMode ?? "quick",
    scopeMode: args.scopeMode ?? "full",
    stdoutPreview: preview(args.stdout ?? ""),
    stderrPreview: preview(args.stderr ?? ""),
    warnings: args.warnings ?? [],
    failureCode: args.failureCode,
    ...(args.timedOut ? { timedOut: true } : {}),
    error: redactSensitive(args.error),
  };
}

async function invokeMarkitdown(
  root: string,
  manifest: CapabilityManifest,
  options: InvokeOptions,
): Promise<MarkitdownOutput> {
  const runner = options.runner ?? defaultMarkitdownRunner;
  const capabilityIdTyped = manifest.id as "markitdown";
  let tempPath: string | null = null;
  let commandInput = "";

  try {
    let inputKind: "path" | "inline";
    try {
      inputKind = normalizeInputKind(options.inputKind);
    } catch {
      return failureOutput(capabilityIdTyped, "input_invalid", "inputKind must be one of: path | inline");
    }

    let input: string;
    try {
      input = parseMarkitdownInput(options.input);
    } catch {
      return failureOutput(capabilityIdTyped, "input_invalid", "input must be a non-empty string");
    }

    if (inputKind === "inline") {
      const tmp = mkdtempSync(join(tmpdir(), `capcontrol-${manifest.id}-`));
      tempPath = join(tmp, `inline-${Date.now()}.html`);
      writeFileSync(tempPath, input, "utf8");
      commandInput = tempPath;
    } else {
      if (isUrlLike(input)) {
        return failureOutput(capabilityIdTyped, "unsupported_input", "URL input is not supported in MVP; use local path or inline content.");
      }
      if (!input) {
        return failureOutput(capabilityIdTyped, "input_invalid", "input is required");
      }
      commandInput = resolve(root, input);
      accessSync(commandInput);
    }

    const args = getArgs(manifest, commandInput);
    const result = runner(manifest.runtime.command, args, { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS });
    if (result.exitCode !== 0) {
      const failureCode = classifyCommandFailure(result);
      return failureOutput(
        capabilityIdTyped,
        failureCode,
        result.stderr || "command execution failed",
        `command exit code: ${result.exitCode}`,
        result.timedOut ?? false,
      );
    }

    const markdown = result.stdout;
    if (!isMarkdownLike(markdown)) {
      return failureOutput(capabilityIdTyped, "output_invalid", "command output failed markdown sanity check", "invalid markdown output");
    }

    const includeMarkdown = !options.outputPath || options.fullOutput;
    const response: MarkitdownOutput = {
      ok: true,
      capabilityId: capabilityIdTyped,
      ...(includeMarkdown ? { markdown } : {}),
      markdownChars: markdown.length,
      warnings: [],
      failureCode: "none",
    };

    if (options.outputPath) {
      try {
        const outputAbs = resolveOutputPath(root, options.outputPath);
        mkdirSync(dirname(outputAbs), { recursive: true });
        writeFileSync(outputAbs, markdown, "utf8");
        response.outputPath = outputAbs;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown output error";
        if (/inside base directory/i.test(message)) {
          return failureOutput(capabilityIdTyped, "path_policy_violation", message, "output path must resolve inside base directory");
        }
        return failureOutput(capabilityIdTyped, "unknown", message, "output path handling failed");
      }
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (/inside base directory/i.test(message)) {
      return failureOutput(capabilityIdTyped, "path_policy_violation", message, "output path must resolve inside base directory");
    }
    if (/inputKind must be one of/i.test(message) || /input must be a non-empty string/i.test(message)) {
      return failureOutput(capabilityIdTyped, "input_invalid", message);
    }
    if (/not supported/i.test(message)) {
      return failureOutput(capabilityIdTyped, "unsupported_input", message);
    }
    return failureOutput(capabilityIdTyped, "unknown", message);
  } finally {
    if (tempPath) {
      rmSync(tempPath, { force: true });
      rmSync(dirname(tempPath), { force: true, recursive: true });
    }
  }
}

async function invokeStrix(
  root: string,
  manifest: CapabilityManifest,
  options: InvokeOptions,
): Promise<StrixOutput> {
  let scanMode: StrixScanMode = "quick";
  let scopeMode: StrixScopeMode = "full";
  let timeoutMs = 0;
  let instruction: string | undefined;

  try {
    scanMode = normalizeStrixScanMode(options.scanMode);
    scopeMode = normalizeStrixScopeMode(options.scopeMode);
    timeoutMs = normalizeStrixTimeoutSecondsToMs(options.timeoutSeconds);
    instruction = normalizeStrixInstruction(options.instruction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid Strix option";
    return strixFailureOutput({ failureCode: "input_invalid", error: message, scanMode, scopeMode });
  }

  if (options.authorized !== true) {
    return strixFailureOutput({
      failureCode: "input_invalid",
      error: "Strix requires explicit --authorized confirmation for authorized-use-only security testing.",
      warnings: ["missing --authorized"],
      scanMode,
      scopeMode,
    });
  }

  let inputKind: "path" | "inline";
  try {
    inputKind = normalizeInputKind(options.inputKind);
  } catch {
    return strixFailureOutput({ failureCode: "input_invalid", error: "inputKind must be one of: path | inline", scanMode, scopeMode });
  }
  if (inputKind === "inline") {
    return strixFailureOutput({
      failureCode: "unsupported_input",
      error: "Strix inline input is not supported; provide an existing local directory.",
      scanMode,
      scopeMode,
    });
  }

  let input: string;
  try {
    input = parseMarkitdownInput(options.input);
  } catch {
    return strixFailureOutput({ failureCode: "input_invalid", error: "input must be a non-empty string", scanMode, scopeMode });
  }

  if (isUrlLike(input) || isDomainLike(input) || isIpLike(input)) {
    return strixFailureOutput({
      failureCode: "unsupported_input",
      error: "Strix is limited to existing local directories in this capability slice; URLs, domains, and IPs are rejected.",
      scanMode,
      scopeMode,
    });
  }

  const target = resolve(root, input);
  try {
    const stat = lstatSync(target);
    if (!stat.isDirectory()) {
      return strixFailureOutput({
        failureCode: "input_invalid",
        error: "Strix target must be an existing local directory.",
        target,
        scanMode,
        scopeMode,
      });
    }
  } catch {
    return strixFailureOutput({
      failureCode: "input_invalid",
      error: "Strix target must be an existing local directory.",
      target,
      scanMode,
      scopeMode,
    });
  }

  const runner = options.runner ?? defaultStrixRunner;
  const tempDir = mkdtempSync(join(tmpdir(), "capcontrol-strix-"));
  const tempConfigPath = join(tempDir, "cli-config.json");
  writeFileSync(tempConfigPath, '{"env": {}}\n', "utf8");

  try {
    const args = getStrixArgs(manifest, target, scanMode, scopeMode, tempConfigPath, instruction);
    const result = runner(manifest.runtime.command, args, {
      timeoutMs,
      maxBuffer: STRIX_MAX_BUFFER_BYTES,
      env: sanitizedStrixEnv(),
      cwd: root,
    });
    const stdoutPreview = preview(result.stdout);
    const stderrPreview = preview(result.stderr);
    const runPath = discoverRunPath(result.stdout, result.stderr, root);

    if (result.exitCode === 0 || result.exitCode === 2) {
      return {
        ok: true,
        capabilityId: "strix",
        completed: true,
        findingsFound: result.exitCode === 2,
        exitCode: result.exitCode,
        target,
        scanMode,
        scopeMode,
        ...(runPath ? { runPath } : {}),
        stdoutPreview,
        stderrPreview,
        warnings: [],
        failureCode: "none",
      };
    }

    const failureCode = classifyCommandFailure(result);
    return strixFailureOutput({
      failureCode,
      error: result.stderr || "Strix command execution failed",
      exitCode: result.exitCode,
      target,
      scanMode,
      scopeMode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut ?? false,
    });
  } finally {
    rmSync(tempConfigPath, { force: true });
    rmSync(tempDir, { force: true, recursive: true });
  }
}

export function invokeCapability(
  baseDir: string,
  capabilityId: "markitdown",
  options: InvokeOptions,
): Promise<MarkitdownOutput>;
export function invokeCapability(
  baseDir: string,
  capabilityId: "strix",
  options: InvokeOptions,
): Promise<StrixOutput>;
export function invokeCapability(
  baseDir: string,
  capabilityId: string,
  options: InvokeOptions,
): Promise<CapabilityOutput>;
export async function invokeCapability(
  baseDir: string,
  capabilityId: string,
  options: InvokeOptions,
): Promise<CapabilityOutput> {
  const { baseDir: root } = getBasePaths(baseDir);
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  if (manifest.runtime.kind !== "local_command") {
    return failureOutput(manifest.id as "markitdown", "command_failed", `Unsupported runtime kind ${manifest.runtime.kind}`);
  }

  if (manifest.id === "markitdown") {
    return invokeMarkitdown(root, manifest, options);
  }
  if (manifest.id === "strix") {
    return invokeStrix(root, manifest, options);
  }

  return {
    ok: false,
    capabilityId: manifest.id as "markitdown",
    markdown: "",
    markdownChars: 0,
    warnings: [`unsupported capability: ${manifest.id}`],
    failureCode: "unsupported_input",
    error: `Unsupported capability: ${manifest.id}`,
  };
}
