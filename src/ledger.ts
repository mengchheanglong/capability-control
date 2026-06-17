import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FailureCode } from "./types.js";

export const CAPABILITY_EVENTS_PATH = "outcomes/capability-events.jsonl";

export interface CapabilityEventRecord {
  schemaVersion: 1;
  recordedAt: string;
  capabilityId: string;
  action: "health" | "invoke";
  ok: boolean;
  status: "available" | "unavailable";
  failureCode: FailureCode;
  message: string;
}

export interface AppendCapabilityEventInput {
  capabilityId: string;
  action: "health" | "invoke";
  ok: boolean;
  status: "available" | "unavailable";
  failureCode: FailureCode;
  message: string;
}

export interface ReadCapabilityEventsOptions {
  limit?: number;
}

export interface ReadCapabilityEventsResult {
  path: string;
  events: CapabilityEventRecord[];
  malformedLines: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapabilityEventRecord(value: unknown): value is CapabilityEventRecord {
  if (!isObject(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.recordedAt === "string" &&
    typeof value.capabilityId === "string" &&
    (value.action === "health" || value.action === "invoke") &&
    typeof value.ok === "boolean" &&
    (value.status === "available" || value.status === "unavailable") &&
    typeof value.failureCode === "string" &&
    typeof value.message === "string"
  );
}

export function appendCapabilityEvent(baseDir: string, input: AppendCapabilityEventInput): string {
  const path = join(baseDir, CAPABILITY_EVENTS_PATH);
  const record: CapabilityEventRecord = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    capabilityId: input.capabilityId,
    action: input.action,
    ok: input.ok,
    status: input.status,
    failureCode: input.failureCode,
    message: input.message,
  };

  mkdirSync(join(baseDir, "outcomes"), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  return path;
}

export function readCapabilityEvents(
  baseDir: string,
  options: ReadCapabilityEventsOptions = {},
): ReadCapabilityEventsResult {
  const path = join(baseDir, CAPABILITY_EVENTS_PATH);
  if (!existsSync(path)) {
    return { path, events: [], malformedLines: 0 };
  }

  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let malformedLines = 0;
  const events: CapabilityEventRecord[] = [];

  for (const line of lines) {
    try {
      const candidate = JSON.parse(line);
      if (!isCapabilityEventRecord(candidate)) {
        malformedLines += 1;
        continue;
      }
      events.push(candidate);
    } catch {
      malformedLines += 1;
    }
  }

  const limit = options.limit;
  const boundedEvents =
    typeof limit === "number" && limit > 0 ? events.slice(-Math.max(Math.floor(limit), 1)) : events;

  return { path, events: boundedEvents, malformedLines };
}
