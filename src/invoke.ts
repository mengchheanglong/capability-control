import { accessSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { CapabilityManifest, MarkitdownOutput } from "./types.js";
import { getBasePaths, loadCapabilityManifestById } from "./registry.js";

export type CommandRunner = (command: string, args: string[]) => { exitCode: number; stdout: string; stderr: string };

export interface InvokeOptions {
  input: string;
  inputKind?: "path" | "inline";
  outputPath?: string;
  runner?: CommandRunner;
}

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
    return {
      exitCode: 1,
      stdout: "",
      stderr: error.message,
    };
  }

  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

function getArgs(manifest: CapabilityManifest, inputPath: string): string[] {
  return (manifest.runtime.args ?? []).map((value) => (value === "{input}" ? inputPath : value));
}

function normalizePath(baseDir: string, value: string): string {
  if (!value) {
    throw new Error("input is required");
  }
  return resolve(baseDir, value);
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
    throw new Error(`Unsupported runtime kind ${manifest.runtime.kind}`);
  }

  const inputKind = options.inputKind ?? "path";
  const runner = options.runner ?? defaultRunner;
  let tempPath: string | null = null;
  let commandInput = "";

  try {
    if (inputKind === "inline") {
      const tmp = mkdtempSync(join(tmpdir(), `capcore-${manifest.id}-`));
      tempPath = join(tmp, `inline-${Date.now()}.html`);
      writeFileSync(tempPath, options.input, "utf8");
      commandInput = tempPath;
    } else {
      if (isUrlLike(options.input)) {
        throw new Error("URL input is not supported in MVP; use local path or inline content.");
      }
      commandInput = normalizePath(root, options.input);
      accessSync(commandInput);
    }

    const args = getArgs(manifest, commandInput);
    const result = runner(manifest.runtime.command, args);
    const markdown = result.stdout;

    if (result.exitCode !== 0) {
      return {
        ok: false,
        capabilityId: manifest.id as "markitdown",
        markdown: "",
        warnings: [`command exit code: ${result.exitCode}`],
        error: result.stderr || "command execution failed",
      };
    }

    if (!markdown || markdown.trim().length === 0) {
      return {
        ok: false,
        capabilityId: manifest.id as "markitdown",
        markdown: "",
        warnings: ["no markdown output"],
        error: "command returned no markdown output",
      };
    }

    const response: MarkitdownOutput = {
      ok: true,
      capabilityId: manifest.id as "markitdown",
      markdown,
      warnings: [],
    };

    if (options.outputPath) {
      const outputAbs = resolve(root, options.outputPath);
      mkdirSync(dirname(outputAbs), { recursive: true });
      writeFileSync(outputAbs, markdown, "utf8");
      response.outputPath = outputAbs;
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      capabilityId: manifest.id as "markitdown",
      markdown: "",
      warnings: ["invoke failed"],
      error: message,
    };
  } finally {
    if (tempPath) {
      rmSync(tempPath, { force: true });
    }
  }
}
