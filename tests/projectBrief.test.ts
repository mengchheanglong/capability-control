import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverVerificationCommands, parseProjectBriefArgs, runProjectBrief } from "../src/projectBrief.js";

const tempRoots: string[] = [];
const repoRoot = process.cwd();

function makeProject(name = "brief-sample", scripts: Record<string, string> = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), "capcontrol-brief-test-"));
  const projectRoot = join(tempRoot, name);
  tempRoots.push(tempRoot);
  mkdirSync(projectRoot, { recursive: true });

  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name,
        private: true,
        scripts,
      },
      null,
      2,
    ),
    "utf8",
  );

  return projectRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("project brief", () => {
  it("dry-run returns a JSON-compatible result and does not create .active", () => {
    const projectRoot = makeProject("brief-dry-run", {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    });

    const result = runProjectBrief({ projectRoot, dryRun: true });
    const parsed = JSON.parse(JSON.stringify(result)) as typeof result;

    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.projectRoot).toBe(resolve(projectRoot));
    expect(parsed.written).toEqual([]);
    expect(parsed.pack.project.name).toBe("brief-dry-run");
    expect(existsSync(join(projectRoot, ".active"))).toBe(false);
  });

  it("normal run writes the four expected files into a temp project", () => {
    const projectRoot = makeProject("brief-write");
    const result = runProjectBrief({ projectRoot });
    const expectedFiles = [
      ".active/ACTIVE_CONTEXT.md",
      ".active/PROMPT_PACK.md",
      ".active/SESSION_HANDOFF.md",
      ".active/STATE.json",
    ];

    expect(result.ok).toBe(true);
    expect(result.written.map((file) => relative(projectRoot, file).replace(/\\/g, "/")).sort()).toEqual(
      expectedFiles.sort(),
    );
    for (const file of expectedFiles) {
      expect(existsSync(join(projectRoot, file))).toBe(true);
    }
  });

  it("discovers package verification commands in preferred order", () => {
    const projectRoot = makeProject("brief-scripts", {
      "verify:product": "npm run test && npm run typecheck",
      build: "vite build",
      test: "vitest run",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      verify: "npm run test",
    });

    expect(discoverVerificationCommands(projectRoot)).toEqual([
      "npm run typecheck",
      "npm run lint",
      "npm run test",
      "npm run build",
      "npm run verify",
      "npm run verify:product",
    ]);
  });

  it("tolerates non-git directories", () => {
    const projectRoot = makeProject("brief-not-git");
    const result = runProjectBrief({ projectRoot, focus: "doc", dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.pack.project.id).toBe("brief-not-git");
    expect(result.pack.handoff.changedFiles).toEqual([]);
    expect(result.pack.handoff.recentCommits).toEqual([]);
  });

  it("CLI smoke prints a dry-run context pack", () => {
    const projectRoot = makeProject("brief-cli", { test: "vitest run" });
    const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const output = execFileSync(
      process.execPath,
      [tsxCli, "src/cli.ts", "brief", "--project-root", projectRoot, "--dry-run"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const result = JSON.parse(output) as ReturnType<typeof runProjectBrief>;

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.pack.project.name).toBe("brief-cli");
  });
});

describe("project brief args", () => {
  it("parses defaults relative to the provided cwd", () => {
    const options = parseProjectBriefArgs(["--focus", "workspace", "--tier", "overview", "--dry-run"], repoRoot);

    expect(options).toEqual({
      projectRoot: resolve(repoRoot),
      focus: "workspace",
      tier: "overview",
      dryRun: true,
    });
  });
});
