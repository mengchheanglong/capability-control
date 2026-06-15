import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CapabilityListItem, CapabilityManifest, EvidenceRecord, EvidenceAssertion } from "./types.js";

const DEFAULT_BASE_DIR = process.cwd();
const CAPABILITY_ROOT = "capabilities";
const EVIDENCE_ROOT = "evidence";

const EXPECTED_MANIFEST_FIELDS: (keyof Omit<CapabilityManifest, "contracts" | "projection" | "runtime">)[] = [
  "schemaVersion",
  "id",
  "name",
  "description",
  "status",
  "whenToUse",
  "failureModes",
];

function fileContent<T>(filePath: string): T {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getBasePaths(baseDir: string = DEFAULT_BASE_DIR) {
  const absBase = resolve(baseDir);
  return {
    baseDir: absBase,
    capabilitiesDir: join(absBase, CAPABILITY_ROOT),
    evidenceDir: join(absBase, EVIDENCE_ROOT),
  };
}

export function loadManifest(filePath: string): CapabilityManifest {
  const manifest = fileContent<unknown>(filePath);
  if (!isObject(manifest)) {
    throw new Error(`Invalid manifest JSON at ${filePath}`);
  }
  for (const field of EXPECTED_MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      throw new Error(`Manifest missing required field: ${field} (${filePath})`);
    }
  }
  return manifest as unknown as CapabilityManifest;
}

export function loadCapabilityManifestById(baseDir: string, capabilityId: string): { manifest: CapabilityManifest; path: string } {
  const { capabilitiesDir } = getBasePaths(baseDir);
  const manifestPath = join(capabilitiesDir, capabilityId, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest for ${capabilityId}`);
  }
  return {
    manifest: loadManifest(manifestPath),
    path: manifestPath,
  };
}

function isEvidenceAssertion(value: unknown): value is EvidenceAssertion {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.ok === "boolean"
  );
}

function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.capabilityId !== "markitdown") return false;
  if (typeof value.verifiedAt !== "string") return false;
  if (!isObject(value.runner)) return false;
  if (typeof value.runner.kind !== "string" || typeof value.runner.command !== "string") return false;
  if (typeof value.inputFixture !== "string") return false;
  if (typeof value.exitCode !== "number") return false;
  if (typeof value.ok !== "boolean") return false;
  if (!Array.isArray(value.assertions) || !value.assertions.every(isEvidenceAssertion)) return false;
  if (typeof value.stdoutPreview !== "string" || typeof value.stderrPreview !== "string") return false;
  if (typeof value.durationMs !== "number") return false;
  return true;
}

function latestEvidence(baseDir: string, capabilityId: string): EvidenceRecord | null {
  const { evidenceDir } = getBasePaths(baseDir);
  const capEvidenceDir = join(evidenceDir, capabilityId);
  if (!existsSync(capEvidenceDir)) return null;

  const files = readdirSync(capEvidenceDir).filter((name) => name.endsWith(".json"));
  if (files.length === 0) return null;

  let latest: EvidenceRecord | null = null;
  let latestTime = 0;

  for (const file of files) {
    const path = join(capEvidenceDir, file);
    try {
      const evidence = fileContent<unknown>(path);
      if (!isEvidenceRecord(evidence)) continue;
      if (!evidence.ok || evidence.exitCode !== 0) continue;
      const hasHeading = evidence.assertions.some((assertion) => assertion.name === "contains_markdown_heading" && assertion.ok);
      const hasOutput = evidence.assertions.some((assertion) => assertion.name === "non_empty_output" && assertion.ok);
      if (!hasHeading || !hasOutput) continue;
      const parsedTime = Date.parse(evidence.verifiedAt);
      if (!Number.isFinite(parsedTime)) continue;
      if (parsedTime > latestTime) {
        latest = evidence;
        latestTime = parsedTime;
      }
    } catch {
      continue;
    }
  }

  return latest;
}

export function listCapabilities(baseDir: string = DEFAULT_BASE_DIR): CapabilityListItem[] {
  const { capabilitiesDir } = getBasePaths(baseDir);
  if (!existsSync(capabilitiesDir)) return [];

  const directories = readdirSync(capabilitiesDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );

  const items: CapabilityListItem[] = [];

  for (const dir of directories) {
    const manifestPath = join(capabilitiesDir, dir.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = loadManifest(manifestPath);
    const evidence = latestEvidence(baseDir, manifest.id);
    const status = evidence ? "verified" : "candidate";
    items.push({
      id: manifest.id,
      name: manifest.name,
      status,
      lastVerifiedAt: evidence ? evidence.verifiedAt : null,
      whenToUse: manifest.whenToUse ?? [],
      failureModes: manifest.failureModes ?? [],
    });
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function scoreValue(content: string, terms: string[]): number {
  const haystack = content.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term)) {
      score += 2;
    }
    const words = term.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = new RegExp(`\\b${word}\\b`, "g");
      const matches = haystack.match(pattern);
      if (matches) {
        score += matches.length;
      }
    }
  }
  return score;
}

export function findCapabilities(query: string, baseDir: string = DEFAULT_BASE_DIR): Array<CapabilityListItem & { score: number }> {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return [];

  const terms = cleanQuery
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0);
  const list = listCapabilities(baseDir);
  const all = list.map((item) => {
    const { manifest } = loadCapabilityManifestById(baseDir, item.id);
    const searchable = [
      manifest.id,
      manifest.name,
      manifest.description,
      ...(manifest.whenToUse ?? []),
    ]
      .join(" ")
      .toLowerCase();
    const directBoost = searchable.includes(cleanQuery) ? 20 : 0;
    return {
      id: item.id,
      name: item.name,
      status: item.status,
      lastVerifiedAt: item.lastVerifiedAt,
      whenToUse: item.whenToUse,
      failureModes: item.failureModes,
      score: directBoost + scoreValue(searchable, terms),
    };
  });

  return all
    .filter((entry) => entry.score > 0)
  .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });
}
