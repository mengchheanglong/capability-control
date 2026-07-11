import { isAbsolute, relative, resolve } from "node:path";
import { StrixScanMode, StrixScopeMode } from "./types.js";
import {
  DEFAULT_STRIX_TIMEOUT_SECONDS,
  MAX_STRIX_TIMEOUT_SECONDS,
  MIN_STRIX_TIMEOUT_SECONDS,
} from "./failures.js";

export type CliArgValue = string | true;

export interface ParsedInvocationArgs {
  [key: string]: CliArgValue;
}

interface ParseResult<T> {
  value: T;
  error: string | null;
}

type MarkitdownInputKind = "path" | "inline";

const INVOKE_OPTION_DEFINITIONS: Record<string, "string" | "boolean"> = {
  input: "string",
  "input-kind": "string",
  output: "string",
  "full-output": "boolean",
  authorized: "boolean",
  "scan-mode": "string",
  "scope-mode": "string",
  "timeout-seconds": "string",
  instruction: "string",
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function parseInvokeArgs(argv: string[]): ParseResult<ParsedInvocationArgs> {
  const value: ParsedInvocationArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;

    const key = raw.slice(2);
    const kind = INVOKE_OPTION_DEFINITIONS[key];
    if (!kind) {
      return {
        value: {},
        error: `unknown option: --${key}`,
      };
    }

    if (kind === "boolean") {
      value[key] = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      return {
        value: {},
        error: `missing value for --${key}`,
      };
    }

    value[key] = next;
    i += 1;
  }

  return {
    value,
    error: null,
  };
}

export function parseMarkitdownInput(value: unknown): string {
  if (!isString(value) || value.trim().length === 0) {
    throw new Error("input must be a non-empty string");
  }
  return value;
}

export function normalizeInputKind(value: unknown): MarkitdownInputKind {
  if (value === undefined || value === "path") return "path";
  if (value === "inline") return "inline";
  throw new Error("inputKind must be one of: path | inline");
}

export function normalizeStrixScanMode(value: unknown): StrixScanMode {
  if (value === undefined) return "quick";
  if (value === "quick" || value === "standard" || value === "deep") return value;
  throw new Error("scanMode must be one of: quick | standard | deep");
}

export function normalizeStrixScopeMode(value: unknown): StrixScopeMode {
  if (value === undefined) return "full";
  if (value === "auto" || value === "diff" || value === "full") return value;
  throw new Error("scopeMode must be one of: auto | diff | full");
}

export function normalizeStrixTimeoutSecondsToMs(value: unknown): number {
  if (value === undefined) return DEFAULT_STRIX_TIMEOUT_SECONDS * 1000;
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isSafeInteger(parsed) || String(value).trim() === "") {
    throw new Error("--timeout-seconds must be an integer number of seconds");
  }
  if (parsed < MIN_STRIX_TIMEOUT_SECONDS || parsed > MAX_STRIX_TIMEOUT_SECONDS) {
    throw new Error(`--timeout-seconds must be between ${MIN_STRIX_TIMEOUT_SECONDS} and ${MAX_STRIX_TIMEOUT_SECONDS}`);
  }
  return parsed * 1000;
}

export function normalizeStrixInstruction(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value) || value.trim().length === 0) {
    throw new Error("--instruction must be a non-empty string");
  }
  return value;
}

export function resolveOutputPath(baseDir: string, outputPath: string): string {
  const root = resolve(baseDir);
  const candidate = resolve(root, outputPath);
  const relation = relative(root, candidate);

  if (relation === "" || relation === ".") return candidate;
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`outputPath must resolve inside base directory: ${outputPath}`);
  }

  return candidate;
}

function hasWhitespace(content: string): boolean {
  return /\s/.test(content);
}

export function isMarkdownLike(content: string): boolean {
  const text = content.trim();
  if (text.length === 0) return false;

  if (/^(\s*#\s+\S)/m.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/m.test(text)) return true;
  if (/\|[^|\n]+\|/m.test(text)) return true;
  if (/^\s*[-*+]\s+\S+/m.test(text)) return true;
  if (/^\s*\d+\.\s+\S+/m.test(text)) return true;
  return hasWhitespace(text) && /\b[a-zA-Z]+\b/.test(text);
}
