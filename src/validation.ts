import { isAbsolute, relative, resolve } from "node:path";

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
