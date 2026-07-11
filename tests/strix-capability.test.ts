import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_STRIX_TIMEOUT_MS, STRIX_MAX_BUFFER_BYTES } from "../src/failures.js";
import { CommandRunnerOptions, invokeCapability } from "../src/invoke.js";
import { verifyCapability } from "../src/verify.js";

const repoRoot = process.cwd();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-control-strix-"));
  mkdirSync(join(root, "capabilities", "strix"), { recursive: true });
  cpSync(join(repoRoot, "capabilities", "strix"), join(root, "capabilities", "strix"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  return root;
}

describe("strix capability", () => {
  let tempRoot: string;
  let oldPythonPath: string | undefined;
  let oldPythonHome: string | undefined;
  let oldTelemetry: string | undefined;
  let oldApiKey: string | undefined;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
    oldPythonPath = process.env.PYTHONPATH;
    oldPythonHome = process.env.PYTHONHOME;
    oldTelemetry = process.env.STRIX_TELEMETRY;
    oldApiKey = process.env.LLM_API_KEY;
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
    if (oldPythonPath === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = oldPythonPath;
    if (oldPythonHome === undefined) delete process.env.PYTHONHOME;
    else process.env.PYTHONHOME = oldPythonHome;
    if (oldTelemetry === undefined) delete process.env.STRIX_TELEMETRY;
    else process.env.STRIX_TELEMETRY = oldTelemetry;
    if (oldApiKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = oldApiKey;
  });

  it("rejects invocation unless --authorized was provided", async () => {
    const target = join(tempRoot, "target");
    mkdirSync(target);
    let called = false;

    const result = await invokeCapability(tempRoot, "strix", {
      input: target,
      runner: () => {
        called = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("input_invalid");
    expect(result.error).toContain("authorized");
  });

  it("rejects inline input and non-local targets before running Strix", async () => {
    let calls = 0;
    const runner = () => {
      calls += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const inline = await invokeCapability(tempRoot, "strix", {
      input: "repo content",
      inputKind: "inline",
      authorized: true,
      runner,
    });
    const url = await invokeCapability(tempRoot, "strix", {
      input: "https://example.com",
      authorized: true,
      runner,
    });
    const domain = await invokeCapability(tempRoot, "strix", {
      input: "example.com",
      authorized: true,
      runner,
    });
    const ip = await invokeCapability(tempRoot, "strix", {
      input: "127.0.0.1",
      authorized: true,
      runner,
    });
    const missing = await invokeCapability(tempRoot, "strix", {
      input: "missing-dir",
      authorized: true,
      runner,
    });
    const filePath = join(tempRoot, "file.txt");
    writeFileSync(filePath, "not a directory", "utf8");
    const file = await invokeCapability(tempRoot, "strix", {
      input: filePath,
      authorized: true,
      runner,
    });

    expect(calls).toBe(0);
    expect(inline.failureCode).toBe("unsupported_input");
    expect(url.failureCode).toBe("unsupported_input");
    expect(domain.failureCode).toBe("unsupported_input");
    expect(ip.failureCode).toBe("unsupported_input");
    expect(missing.failureCode).toBe("input_invalid");
    expect(file.failureCode).toBe("input_invalid");
  });

  it("builds headless args, appends instruction, sanitizes Python env, sets telemetry default, and removes temp config", async () => {
    process.env.PYTHONPATH = "hermes-site-packages";
    process.env.PYTHONHOME = "hermes-python-home";
    delete process.env.STRIX_TELEMETRY;
    const target = join(tempRoot, "menui");
    mkdirSync(target);
    let observedCommand = "";
    let observedArgs: string[] = [];
    let observedOptions: CommandRunnerOptions | undefined;
    let observedConfig = "";

    const result = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      scanMode: "standard",
      scopeMode: "diff",
      timeoutSeconds: "60",
      instruction: "focus on auth flows",
      runner: (command, args, options) => {
        observedCommand = command;
        observedArgs = args;
        observedOptions = options;
        const configIndex = args.indexOf("--config") + 1;
        observedConfig = args[configIndex];
        expect(existsSync(observedConfig)).toBe(true);
        expect(readFileSync(observedConfig, "utf8")).toBe('{"env": {}}\n');
        return {
          exitCode: 0,
          stdout: "completed run at strix_runs/scan-123",
          stderr: "",
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(observedCommand).toBe("strix");
    expect(observedArgs).toEqual([
      "-n",
      "--target",
      resolve(target),
      "--scan-mode",
      "standard",
      "--scope-mode",
      "diff",
      "--config",
      observedConfig,
      "--instruction",
      "focus on auth flows",
    ]);
    expect(observedOptions?.timeoutMs).toBe(60_000);
    expect(observedOptions?.maxBuffer).toBe(STRIX_MAX_BUFFER_BYTES);
    expect(observedOptions?.env?.PYTHONPATH).toBeUndefined();
    expect(observedOptions?.env?.PYTHONHOME).toBeUndefined();
    expect(observedOptions?.env?.STRIX_TELEMETRY).toBe("0");
    expect(existsSync(observedConfig)).toBe(false);
    expect(result.runPath).toBe(resolve(tempRoot, "strix_runs", "scan-123"));
  });

  it("uses the default Strix timeout when --timeout-seconds is omitted and rejects blank instruction before running", async () => {
    const target = join(tempRoot, "target");
    mkdirSync(target);
    let observedOptions: CommandRunnerOptions | undefined;
    const defaulted = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      runner: (_command, _args, options) => {
        observedOptions = options;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    let calls = 0;
    const blank = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      instruction: "   ",
      runner: () => {
        calls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(defaulted.ok).toBe(true);
    expect(observedOptions?.timeoutMs).toBe(DEFAULT_STRIX_TIMEOUT_MS);
    expect(blank.ok).toBe(false);
    expect(blank.failureCode).toBe("input_invalid");
    expect(blank.error).toContain("instruction");
    expect(calls).toBe(0);
  });

  it("treats exit 0 as completed without findings and exit 2 as completed with findings", async () => {
    const target = join(tempRoot, "target");
    mkdirSync(target);
    const clean = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      runner: () => ({ exitCode: 0, stdout: "no findings", stderr: "" }),
    });
    const findings = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      runner: () => ({ exitCode: 2, stdout: "findings found", stderr: "" }),
    });

    expect(clean.ok).toBe(true);
    expect(clean.completed).toBe(true);
    expect(clean.findingsFound).toBe(false);
    expect(findings.ok).toBe(true);
    expect(findings.completed).toBe(true);
    expect(findings.findingsFound).toBe(true);
    expect(findings.failureCode).toBe("none");
  });

  it("returns failures for other nonzero exit codes and redacts API keys", async () => {
    process.env.LLM_API_KEY = "sk-test-secret";
    const target = join(tempRoot, "target");
    mkdirSync(target);

    const result = await invokeCapability(tempRoot, "strix", {
      input: target,
      authorized: true,
      runner: () => ({
        exitCode: 1,
        stdout: "LLM_API_KEY=sk-test-secret",
        stderr: "failed with api_key: sk-test-secret",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.completed).toBe(false);
    expect(result.failureCode).toBe("command_failed");
    expect(result.stdoutPreview).not.toContain("sk-test-secret");
    expect(result.stderrPreview).not.toContain("sk-test-secret");
    expect(result.error).not.toContain("sk-test-secret");
  });

  it("verifies pinned Strix runtime dependencies and Docker reachability before writing evidence", () => {
    const calls: Array<{ command: string; args: string[]; options?: CommandRunnerOptions }> = [];

    const result = verifyCapability(tempRoot, "strix", {
      runner: (command, args, options) => {
        calls.push({ command, args, options });
        if (command === "strix") return { exitCode: 0, stdout: "strix 1.0.4", stderr: "" };
        if (command === "uv") return { exitCode: 0, stdout: "C:\\uv\\tools\n", stderr: "" };
        if (command.endsWith("python.exe")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              "openai-agents": "0.14.6",
              openai: "2.44.0",
              litellm: "1.90.1",
            }),
            stderr: "",
          };
        }
        if (command === "docker") return { exitCode: 0, stdout: "\"27.0.0\"", stderr: "" };
        return { exitCode: 1, stdout: "", stderr: "unexpected command" };
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls[0].command).toBe("strix");
    expect(calls[0].args).toEqual(["--version"]);
    expect(calls[0].args).not.toContain("--target");
    expect(calls[0].options?.env?.PYTHONPATH).toBeUndefined();
    expect(calls[0].options?.env?.PYTHONHOME).toBeUndefined();
    expect(calls[1]).toMatchObject({ command: "uv", args: ["tool", "dir"] });
    expect(calls[2].command).toMatch(/strix-agent[\\/]Scripts[\\/]python\.exe$/);
    expect(calls[2].args.slice(0, 2)).toEqual(["-I", "-c"]);
    expect(calls[3].command).toBe("docker");
    expect(calls[3].args).toEqual(["info", "--format", "{{json .ServerVersion}}"]);
    expect(result.evidencePath).toBeTruthy();

    const evidence = JSON.parse(readFileSync(result.evidencePath!, "utf8"));
    expect(evidence.capabilityId).toBe("strix");
    expect(evidence.ok).toBe(true);
    expect(evidence.assertions).toEqual([
      { name: "strix_version_1_0_4", ok: true },
      { name: "openai_agents_version_0_14_6", ok: true },
      { name: "openai_version_2_44_0", ok: true },
      { name: "litellm_version_1_90_1", ok: true },
      { name: "docker_daemon_reachable", ok: true },
    ]);
  });

  it("does not write verified evidence when a Strix prerequisite fails", () => {
    const result = verifyCapability(tempRoot, "strix", {
      runner: (command) => {
        if (command === "strix") return { exitCode: 0, stdout: "strix 1.0.4", stderr: "" };
        if (command === "uv") return { exitCode: 0, stdout: "C:\\uv\\tools\n", stderr: "" };
        if (command.endsWith("python.exe")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              "openai-agents": "0.14.6",
              openai: "2.44.0",
              litellm: "1.90.1",
            }),
            stderr: "",
          };
        }
        return { exitCode: 1, stdout: "", stderr: "Docker daemon unavailable" };
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("command_failed");
    expect(result.error).toContain("Docker daemon unavailable");
    expect(existsSync(join(tempRoot, "evidence", "strix"))).toBe(false);
  });
});
