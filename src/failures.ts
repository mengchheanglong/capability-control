import { FailureCode } from "./types.js";

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  failureCode?: FailureCode;
}

export interface FailureClassificationInput {
  inputInvalid?: boolean;
  unsupportedInput?: boolean;
  pathPolicyViolation?: boolean;
  outputInvalid?: boolean;
  fixtureMissing?: boolean;
  verificationFailed?: boolean;
  timedOut?: boolean;
  runnerFailureCode?: FailureCode;
  errorMessage?: string;
  exitCode?: number;
  defaultCode?: FailureCode;
}

function hasText(message: string | undefined, pattern: RegExp): boolean {
  if (!message) return false;
  return pattern.test(message);
}

export function classifyFailureCode(input: FailureClassificationInput): FailureCode {
  if (input?.inputInvalid) return "input_invalid";
  if (input?.unsupportedInput) return "unsupported_input";
  if (input?.pathPolicyViolation) return "path_policy_violation";
  if (input?.timedOut) return "timeout";
  if (input?.outputInvalid) return "output_invalid";
  if (input?.fixtureMissing) return "fixture_missing";

  if (input?.runnerFailureCode && input.runnerFailureCode !== "unknown") {
    return input.runnerFailureCode;
  }

  if (hasText(input?.errorMessage, /not\s+found/i)) {
    return "tool_missing";
  }

  if (input?.exitCode && input.exitCode !== 0) return "command_failed";
  if (input?.verificationFailed) return "verification_failed";

  return input?.defaultCode ?? "none";
}
