import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { AllowedOutcome } from "./types.js";

export interface OutcomeRecord {
  schemaVersion: 1;
  capabilityId: string;
  recordedAt: string;
  outcome: AllowedOutcome;
  note: string;
  source: "operator";
}

export interface AppendOutcomeOptions {
  outcome: AllowedOutcome;
  note: string;
  source?: "operator";
}

export function appendOutcome(baseDir: string, capabilityId: string, options: AppendOutcomeOptions): string {
  if (!options.note || options.note.trim().length === 0) {
    throw new Error("note is required");
  }
  if (!["success", "partial", "failure"].includes(options.outcome)) {
    throw new Error(`invalid outcome: ${options.outcome}`);
  }

  const filePath = join(baseDir, "outcomes", `${capabilityId}.jsonl`);
  const record: OutcomeRecord = {
    schemaVersion: 1,
    capabilityId,
    recordedAt: new Date().toISOString(),
    outcome: options.outcome,
    note: options.note,
    source: options.source ?? "operator",
  };

  mkdirSync(join(baseDir, "outcomes"), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return filePath;
}
