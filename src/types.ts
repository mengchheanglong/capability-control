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

export interface MarkitdownOutput {
  ok: boolean;
  capabilityId: "markitdown";
  markdown?: string;
  markdownChars?: number;
  outputPath?: string;
  warnings: string[];
  error?: string;
}

export interface VerifyResult {
  ok: boolean;
  capabilityId: string;
  evidencePath?: string;
  error?: string;
}
