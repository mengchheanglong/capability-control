import { listCapabilities, loadCapabilityManifestById } from "./registry.js";
import { appendCapabilityEvent } from "./ledger.js";
import { FailureCode, HealthResult, VerifyResult } from "./types.js";
import { verifyCapability } from "./verify.js";
import { classifyFailureCode } from "./failures.js";

export interface HealthOptions {
  now?: () => string;
  verify?: (baseDir: string, capabilityId: string) => VerifyResult;
}

const DEFAULT_NOW = () => new Date().toISOString();
const DEFAULT_FALLBACK = "py -m markitdown fallback is attempted when bare markitdown is missing";

function healthFromVerify(capabilityId: string, result: VerifyResult, checkedAt: string): HealthResult["capabilities"][number] {
  const status = result.ok ? "available" : "unavailable";
  if (result.ok) {
    return {
      id: capabilityId,
      status,
      liveVerified: true,
      lastVerifiedAt: checkedAt,
      failureCode: result.failureCode,
      error: null,
      ...(capabilityId === "markitdown" ? { fallback: DEFAULT_FALLBACK } : {}),
    };
  }

  return {
    id: capabilityId,
    status,
    liveVerified: false,
    lastVerifiedAt: null,
    failureCode: result.failureCode,
    error: result.error ?? "verification failed",
    ...(capabilityId === "markitdown" ? { fallback: DEFAULT_FALLBACK } : {}),
  };
}

function classifyHealthFailure(message: string): FailureCode {
  return classifyFailureCode({ errorMessage: message, defaultCode: "unknown" });
}

export function healthCheck(baseDir: string, capabilityId?: string): HealthResult;
export function healthCheck(baseDir: string, capabilityId: string | undefined, options?: HealthOptions): HealthResult;
export function healthCheck(
  baseDir: string,
  capabilityId?: string,
  options?: HealthOptions,
): HealthResult {
  const verify = options?.verify ?? verifyCapability;
  const now = options?.now ?? DEFAULT_NOW;
  const checkedAt = now();

  const candidates = capabilityId ? [capabilityId] : listCapabilities(baseDir).map((item) => item.id);
  const capabilities: HealthResult["capabilities"] = [];
  let ledgerPath: string | undefined;

  for (const candidate of candidates) {
    try {
      loadCapabilityManifestById(baseDir, candidate);
      const result = verify(baseDir, candidate);
      const health = healthFromVerify(candidate, result, checkedAt);
      capabilities.push(health);
      ledgerPath = appendCapabilityEvent(baseDir, {
        capabilityId: candidate,
        action: "health",
        ok: health.status === "available",
        status: health.status,
        failureCode: health.failureCode,
        message: health.error ?? "live verification succeeded",
      });
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to determine capability status";
      const failureCode = classifyHealthFailure(message);
      const health: HealthResult["capabilities"][number] = {
        id: candidate,
        status: "unavailable",
        liveVerified: false,
        lastVerifiedAt: null,
        failureCode,
        error: message,
        ...(candidate === "markitdown" ? { fallback: DEFAULT_FALLBACK } : {}),
      };
      capabilities.push(health);
      ledgerPath = appendCapabilityEvent(baseDir, {
        capabilityId: candidate,
        action: "health",
        ok: false,
        status: "unavailable",
        failureCode,
        message,
      });
    }
  }

  return {
    ok: capabilities.every((item) => item.status === "available"),
    checkedAt,
    ...(ledgerPath ? { ledgerPath } : {}),
    capabilities,
  };
}
