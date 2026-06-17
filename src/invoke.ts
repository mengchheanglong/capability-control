import { accessSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { CapabilityManifest, FailureCode, MarkitdownOutput } from "./types.js";
import { getBasePaths, loadCapabilityManifestById } from "./registry.js";
import { isMarkdownLike, normalizeInputKind, parseMarkitdownInput, resolveOutputPath } from "./validation.js";
import { CommandResult, DEFAULT_COMMAND_TIMEOUT_MS, classifyFailureCode } from "./failures.js";

export type CommandRunner = (command: string, args: string[]) => CommandResult;

export interface InvokeOptions {
  input: string;
  inputKind?: "path" | "inline";
  outputPath?: string;
  fullOutput?: boolean;
  runner?: CommandRunner;
}

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

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function invokeCapability(
  baseDir: string,
  capabilityId: string,
  options: InvokeOptions,
): Promise<MarkitdownOutput> {
  const { baseDir: root } = getBasePaths(baseDir);
  const { manifest } = loadCapabilityManifestById(root, capabilityId);
  if (manifest.runtime.kind !== "local_command") {
    return failureOutput(manifest.id as "markitdown", "command_failed", `Unsupported runtime kind ${manifest.runtime.kind}`);
  }

  const runner = options.runner ?? defaultRunner;
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
      const tmp = mkdtempSync(join(tmpdir(), `capcore-${manifest.id}-`));
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
    const result = runner(manifest.runtime.command, args);
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
    }
  }
}
