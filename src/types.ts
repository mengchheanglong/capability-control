export type CapabilityStatus = "candidate" | "verified";
export type InputKind = "path" | "inline";

export type AllowedOutcome = "success" | "partial" | "failure";

export interface CapabilityRuntime {
  kind: "local_command";
  command: string;
  args: string[];
}

export interface CapabilityContracts {
  inputSchema: string;
  outputSchema: string;
}

export interface CapabilityProjection {
  hermesSkill: string;
  recommendedInterface: string;
}

export interface CapabilityManifest {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  status: CapabilityStatus;
  source?: {
    url: string;
    pinnedRelease?: string;
    inspectedSourceHead?: string;
  };
  runtime: CapabilityRuntime;
  contracts: CapabilityContracts;
  whenToUse: string[];
  failureModes: string[];
  projection: CapabilityProjection;
}

export interface CapabilityListItem {
  id: string;
  name: string;
  status: CapabilityStatus;
  lastVerifiedAt: string | null;
  whenToUse: string[];
  failureModes: string[];
}

export interface EvidenceAssertion {
  name: string;
  ok: boolean;
}

export interface EvidenceRecord {
  schemaVersion: number;
  capabilityId: string;
  verifiedAt: string;
  runner: {
    kind: "local_command";
    command: string;
  };
  inputFixture: string;
  exitCode: number;
  ok: boolean;
  assertions: EvidenceAssertion[];
  stdoutPreview: string;
  stderrPreview: string;
  durationMs: number;
}

export interface MarkitdownInput {
  input: string;
  inputKind?: InputKind;
  outputPath?: string;
}

export type FailureCode =
  | "none"
  | "tool_missing"
  | "input_invalid"
  | "unsupported_input"
  | "path_policy_violation"
  | "command_failed"
  | "timeout"
  | "output_invalid"
  | "fixture_missing"
  | "verification_failed"
  | "unknown";

export interface MarkitdownOutput {
  ok: boolean;
  capabilityId: "markitdown";
  markdown?: string;
  markdownChars?: number;
  outputPath?: string;
  warnings: string[];
  failureCode: FailureCode;
  timedOut?: boolean;
  error?: string;
}

export type StrixScanMode = "quick" | "standard" | "deep";
export type StrixScopeMode = "auto" | "diff" | "full";

export interface StrixInput {
  input: string;
  inputKind?: InputKind;
  authorized?: boolean;
  scanMode?: StrixScanMode;
  scopeMode?: StrixScopeMode;
  timeoutSeconds?: number;
  instruction?: string;
}

export interface StrixOutput {
  ok: boolean;
  capabilityId: "strix";
  completed: boolean;
  findingsFound: boolean;
  exitCode: number | null;
  target: string | null;
  scanMode: StrixScanMode;
  scopeMode: StrixScopeMode;
  runPath?: string;
  stdoutPreview: string;
  stderrPreview: string;
  warnings: string[];
  failureCode: FailureCode;
  timedOut?: boolean;
  error?: string;
}

export type CapabilityOutput = MarkitdownOutput | StrixOutput;

export interface VerifyResult {
  ok: boolean;
  capabilityId: string;
  failureCode: FailureCode;
  evidencePath?: string;
  error?: string;
}

export interface HealthCapabilityStatus {
  id: string;
  status: "available" | "unavailable";
  liveVerified: boolean;
  lastVerifiedAt: string | null;
  failureCode: FailureCode;
  error: string | null;
  fallback?: string;
}

export interface HealthResult {
  ok: boolean;
  checkedAt: string;
  ledgerPath?: string;
  capabilities: HealthCapabilityStatus[];
}
