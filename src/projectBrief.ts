import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type FocusType = "workspace" | "quest" | "doc" | "graph";
export type ContextTier = "summary" | "overview" | "full";
export type ReadinessStatus = "seed" | "partial" | "ready";

export interface ChangedFile {
  status: string;
  path: string;
}

export interface RecentCommit {
  hash: string;
  date: string;
  subject: string;
}

export interface ContextFile {
  label: string;
  path: string;
  purpose: string;
}

export interface ContextPack {
  timestamp: string;
  tier: ContextTier;
  project: {
    id: string;
    name: string;
    root: string;
  };
  focus: {
    type: FocusType;
    label: string;
  };
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  contextFiles: ContextFile[];
  handoff: {
    summary: string;
    nextStep: string;
    verificationCommands: string[];
    changedFiles: ChangedFile[];
    recentCommits: RecentCommit[];
  };
  readiness: {
    score: number;
    status: ReadinessStatus;
    summary: string;
  };
}

export interface ProjectBriefOptions {
  projectRoot: string;
  focus: FocusType;
  tier: ContextTier;
  dryRun: boolean;
}

export interface ProjectBriefResult {
  ok: true;
  projectRoot: string;
  dryRun: boolean;
  written: string[];
  pack: ContextPack;
}

const VALID_FOCUS = new Set<FocusType>(["workspace", "quest", "doc", "graph"]);
const VALID_TIERS = new Set<ContextTier>(["summary", "overview", "full"]);
const VERIFICATION_SCRIPT_ORDER = ["typecheck", "lint", "test", "build", "verify", "verify:product"];

export function parseProjectBriefArgs(argv: string[], cwd = process.cwd()): ProjectBriefOptions {
  const options: ProjectBriefOptions = {
    projectRoot: cwd,
    focus: "workspace",
    tier: "overview",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--project-root") {
      index += 1;
      options.projectRoot = requiredValue(arg, argv[index]);
      continue;
    }

    if (arg === "--focus") {
      index += 1;
      const value = requiredValue(arg, argv[index]);
      if (!VALID_FOCUS.has(value as FocusType)) {
        throw new Error(`Invalid --focus: ${value}`);
      }
      options.focus = value as FocusType;
      continue;
    }

    if (arg === "--tier") {
      index += 1;
      const value = requiredValue(arg, argv[index]);
      if (!VALID_TIERS.has(value as ContextTier)) {
        throw new Error(`Invalid --tier: ${value}`);
      }
      options.tier = value as ContextTier;
      continue;
    }

    throw new Error(`Unknown brief option: ${arg}`);
  }

  return {
    ...options,
    projectRoot: resolve(cwd, options.projectRoot),
  };
}

export function runProjectBrief(options: Partial<ProjectBriefOptions> = {}): ProjectBriefResult {
  const resolvedOptions: ProjectBriefOptions = {
    projectRoot: resolve(options.projectRoot ?? process.cwd()),
    focus: options.focus ?? "workspace",
    tier: options.tier ?? "overview",
    dryRun: options.dryRun ?? false,
  };
  const pack = buildContextPack(resolvedOptions);
  const written = resolvedOptions.dryRun ? [] : writeContextFiles(resolvedOptions.projectRoot, pack);

  return {
    ok: true,
    projectRoot: resolvedOptions.projectRoot,
    dryRun: resolvedOptions.dryRun,
    written,
    pack,
  };
}

export function buildContextPack(options: ProjectBriefOptions): ContextPack {
  const projectRoot = resolve(options.projectRoot);
  const pkg = readPackageJson(projectRoot);
  const projectName = String(pkg?.name || basename(projectRoot) || "project");
  const verificationCommands = discoverVerificationCommands(projectRoot);
  const changedFiles = readChangedFiles(projectRoot);
  const recentCommits = readRecentCommits(projectRoot);
  const contextFiles = buildContextFiles();
  const label = focusLabel(options.focus);
  const readiness = buildReadiness({
    verificationCommands,
    changedFiles,
    recentCommits,
    contextFiles,
  });

  return {
    timestamp: new Date().toISOString(),
    tier: options.tier,
    project: {
      id: projectName,
      name: projectName,
      root: projectRoot,
    },
    focus: {
      type: options.focus,
      label,
    },
    objective:
      options.focus === "workspace"
        ? `Resume implementation in ${projectName} using current project context and active verification gates.`
        : `Resume ${label.toLowerCase()} work in ${projectName} with one bounded implementation step.`,
    suggestedAction:
      verificationCommands.length > 0
        ? `Implement one bounded change, then run: ${verificationCommands.slice(0, 2).join(" then ")}.`
        : "Implement one bounded change, then run the smallest available project checks.",
    successCriteria: [
      "Change is implemented with bounded scope.",
      "Relevant checks are executed and outcomes recorded.",
      "Session handoff includes the next concrete step.",
    ],
    contextFiles,
    handoff: {
      summary: `${projectName} context pack generated for ${label.toLowerCase()}.`,
      nextStep:
        changedFiles.length > 0
          ? "Stabilize current changed files and run verification before adding new scope."
          : "Start the next bounded implementation slice, then verify and record outcomes.",
      verificationCommands,
      changedFiles,
      recentCommits,
    },
    readiness,
  };
}

export function discoverVerificationCommands(projectRoot: string): string[] {
  const pkg = readPackageJson(projectRoot);
  const scripts = pkg?.scripts || {};
  const packageRunner = detectPackageRunner(projectRoot);

  return VERIFICATION_SCRIPT_ORDER.filter((scriptName) => Boolean(scripts[scriptName])).map(
    (scriptName) => `${packageRunner} run ${scriptName}`,
  );
}

function requiredValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function readPackageJson(projectRoot: string): { name?: string; scripts?: Record<string, string> } | null {
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function detectPackageRunner(projectRoot: string): "npm" | "pnpm" | "yarn" {
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

function runGit(projectRoot: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", projectRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trimEnd();
  } catch {
    return "";
  }
}

function isGitRepo(projectRoot: string): boolean {
  const topLevel = runGit(projectRoot, ["rev-parse", "--show-toplevel"]);
  return Boolean(topLevel) && resolve(topLevel.trim()).toLowerCase() === resolve(projectRoot).toLowerCase();
}

function readChangedFiles(projectRoot: string): ChangedFile[] {
  if (!isGitRepo(projectRoot)) {
    return [];
  }

  const status = runGit(projectRoot, ["status", "--short"]);
  if (!status) {
    return [];
  }

  return status
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim() || "??",
      path: line.slice(3).trim(),
    }));
}

function readRecentCommits(projectRoot: string): RecentCommit[] {
  if (!isGitRepo(projectRoot)) {
    return [];
  }

  const raw = runGit(projectRoot, ["log", "--pretty=format:%h%x09%cs%x09%s", "-n", "5"]);
  if (!raw) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...subjectParts] = line.split("\t");
      return {
        hash: String(hash || "").trim(),
        date: String(date || "").trim(),
        subject: subjectParts.join("\t").trim(),
      };
    })
    .filter((commit) => Boolean(commit.hash));
}

function focusLabel(focus: FocusType): string {
  switch (focus) {
    case "quest":
      return "Quest Focus";
    case "doc":
      return "Document Focus";
    case "graph":
      return "Graph Focus";
    default:
      return "Workspace";
  }
}

function buildContextFiles(): ContextFile[] {
  return [
    {
      label: "Active Context",
      path: ".active/ACTIVE_CONTEXT.md",
      purpose: "Current working brief for the active project.",
    },
    {
      label: "Prompt Pack",
      path: ".active/PROMPT_PACK.md",
      purpose: "Focused implementation brief for the active session.",
    },
    {
      label: "Session Handoff",
      path: ".active/SESSION_HANDOFF.md",
      purpose: "Compact summary and next step for the next session.",
    },
    {
      label: "State",
      path: ".active/STATE.json",
      purpose: "Machine-readable context pack state.",
    },
  ];
}

function buildReadiness(input: {
  verificationCommands: string[];
  changedFiles: ChangedFile[];
  recentCommits: RecentCommit[];
  contextFiles: ContextFile[];
}): ContextPack["readiness"] {
  const score = Math.max(
    30,
    Math.min(
      95,
      40 +
        (input.verificationCommands.length > 0 ? 25 : 0) +
        (input.recentCommits.length > 0 ? 15 : 0) +
        (input.contextFiles.length >= 4 ? 10 : 0) +
        (input.changedFiles.length === 0 ? 5 : 0),
    ),
  );
  const status: ReadinessStatus = score >= 80 ? "ready" : score >= 55 ? "partial" : "seed";

  return {
    score,
    status,
    summary: readinessSummary(status),
  };
}

function readinessSummary(status: ReadinessStatus): string {
  if (status === "ready") {
    return "Project has context, verification hooks, and repository history for efficient execution.";
  }
  if (status === "partial") {
    return "Project is usable, but some context or repository signals are thin.";
  }
  return "Project context is sparse and needs setup before reliable long-session execution.";
}

function writeContextFiles(projectRoot: string, pack: ContextPack): string[] {
  const activeRoot = join(projectRoot, ".active");
  mkdirSync(activeRoot, { recursive: true });

  const files = [
    ["PROMPT_PACK.md", renderPromptPack(pack)],
    ["SESSION_HANDOFF.md", renderSessionHandoff(pack)],
    ["ACTIVE_CONTEXT.md", renderActiveContext(pack)],
    ["STATE.json", `${JSON.stringify(pack, null, 2)}\n`],
  ] as const;

  return files.map(([fileName, content]) => {
    const filePath = join(activeRoot, fileName);
    writeFileSync(filePath, content, "utf8");
    return filePath;
  });
}

function renderPromptPack(pack: ContextPack): string {
  const lines = [
    `# ${pack.focus.label} Prompt Pack`,
    "",
    `Generated: ${pack.timestamp}`,
    `Tier: ${pack.tier}`,
    `Project: ${pack.project.name}`,
    `Path: ${pack.project.root}`,
    "",
    "## Objective",
    pack.objective,
    "",
    "## Suggested Action",
    pack.suggestedAction,
    "",
    "## Success Criteria",
    ...pack.successCriteria.map((item) => `- ${item}`),
    "",
    "## Verification Commands",
    ...renderList(pack.handoff.verificationCommands),
    "",
    "## Changed Files",
    ...renderChangedFiles(pack.handoff.changedFiles),
    "",
    "## Context Files",
    ...pack.contextFiles.map((file) => `- ${file.path}: ${file.purpose}`),
  ];

  return `${lines.join("\n").trim()}\n`;
}

function renderSessionHandoff(pack: ContextPack): string {
  const lines = [
    "# Session Handoff",
    "",
    `Generated: ${pack.timestamp}`,
    `Project: ${pack.project.name}`,
    `Path: ${pack.project.root}`,
    `Focus: ${pack.focus.label}`,
    "",
    "## Summary",
    pack.handoff.summary,
    "",
    "## Next Step",
    pack.handoff.nextStep,
    "",
    "## Readiness",
    `- Score: ${pack.readiness.score}/100 (${pack.readiness.status})`,
    `- ${pack.readiness.summary}`,
    "",
    "## Verification Commands",
    ...renderList(pack.handoff.verificationCommands),
    "",
    "## Recent Commits",
    ...renderRecentCommits(pack.handoff.recentCommits),
  ];

  return `${lines.join("\n").trim()}\n`;
}

function renderActiveContext(pack: ContextPack): string {
  const lines = [
    "# Active Context",
    "",
    `Generated: ${pack.timestamp}`,
    `Project: ${pack.project.name}`,
    `Root: ${pack.project.root}`,
    `Focus: ${pack.focus.type}`,
    `Tier: ${pack.tier}`,
    "",
    "## Current State",
    `- Readiness: ${pack.readiness.status} (${pack.readiness.score}/100)`,
    `- ${pack.readiness.summary}`,
    "",
    "## Working Rule",
    "Use one bounded implementation slice, preserve unrelated files, and record verification outcomes in the handoff.",
    "",
    "## Changed Files",
    ...renderChangedFiles(pack.handoff.changedFiles),
  ];

  return `${lines.join("\n").trim()}\n`;
}

function renderList(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- None detected"];
}

function renderChangedFiles(items: ChangedFile[]): string[] {
  return items.length ? items.map((item) => `- ${item.status}: ${item.path}`) : ["- None detected"];
}

function renderRecentCommits(items: RecentCommit[]): string[] {
  return items.length
    ? items.map((commit) => `- ${commit.hash} ${commit.date}: ${commit.subject}`)
    : ["- None detected"];
}
