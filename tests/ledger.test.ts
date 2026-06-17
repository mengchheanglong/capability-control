import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCapabilityEvent, readCapabilityEvents } from "../src/ledger.js";

function createFixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), "capability-control-ledger-"));
  mkdirSync(join(root, "outcomes"), { recursive: true });
  return root;
}

describe("capability events ledger", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = createFixtureRoot();
  });

  afterEach(() => {
    rmdirSync(tempRoot, { recursive: true });
  });

  it("appends and reads invoke events", () => {
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "invoke",
      ok: true,
      status: "available",
      failureCode: "none",
      message: "invoke succeeded",
    });
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "invoke",
      ok: false,
      status: "unavailable",
      failureCode: "input_invalid",
      message: "input invalid",
    });

    const { path, events, malformedLines } = readCapabilityEvents(tempRoot);
    expect(path).toBe(join(tempRoot, "outcomes", "capability-events.jsonl"));
    expect(malformedLines).toBe(0);
    expect(events).toHaveLength(2);
    expect(events[0].action).toBe("invoke");
    expect(events[1].failureCode).toBe("input_invalid");
    expect(events[1].status).toBe("unavailable");
  });

  it("returns the most recent events when limited", () => {
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "health",
      ok: true,
      status: "available",
      failureCode: "none",
      message: "health succeeded",
    });
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "invoke",
      ok: false,
      status: "unavailable",
      failureCode: "input_invalid",
      message: "input invalid",
    });
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "invoke",
      ok: true,
      status: "available",
      failureCode: "none",
      message: "invoke succeeded",
    });

    const { events, malformedLines } = readCapabilityEvents(tempRoot, { limit: 1 });
    expect(malformedLines).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("invoke succeeded");
  });

  it("ignores malformed lines with warning count", () => {
    appendCapabilityEvent(tempRoot, {
      capabilityId: "markitdown",
      action: "invoke",
      ok: true,
      status: "available",
      failureCode: "none",
      message: "invoke succeeded",
    });
    appendFileSync(join(tempRoot, "outcomes", "capability-events.jsonl"), "not-json-line\n", "utf8");

    const { events, malformedLines } = readCapabilityEvents(tempRoot);
    expect(events).toHaveLength(1);
    expect(malformedLines).toBe(1);
  });

  it("returns empty events when file is missing", () => {
    const { events, malformedLines } = readCapabilityEvents(tempRoot);
    expect(events).toHaveLength(0);
    expect(malformedLines).toBe(0);
    expect(existsSync(join(tempRoot, "outcomes", "capability-events.jsonl"))).toBe(false);
  });
});
