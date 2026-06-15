import { appendOutcome } from "./outcome.js";
import { findCapabilities, listCapabilities } from "./registry.js";
import { verifyCapability } from "./verify.js";
import { invokeCapability } from "./invoke.js";

interface ParsedArgs {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const opts: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      opts[key] = next;
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return opts;
}

function usage(): never {
  const text = [
    "capcore list",
    "capcore find <query>",
    "capcore verify markitdown",
    "capcore invoke markitdown --input <path-or-inline> [--input-kind path|inline] [--output <path>]",
    "capcore report markitdown --outcome <success|partial|failure> --note <text>",
  ].join("\n");
  process.stdout.write(`${text}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , ...argv] = process.argv;
  if (argv.length < 1) usage();

  const command = argv[0];
  const baseDir = process.cwd();

  switch (command) {
    case "list": {
      const items = listCapabilities(baseDir);
      console.log(JSON.stringify(items, null, 2));
      return;
    }
    case "find": {
      const query = argv.slice(1).join(" ");
      if (!query) usage();
      const matches = findCapabilities(query, baseDir);
      console.log(JSON.stringify(matches, null, 2));
      return;
    }
    case "verify": {
      const capability = argv[1];
      if (!capability) usage();
      const result = verifyCapability(baseDir, capability);
      if (!result.ok) {
        console.error(JSON.stringify({ ok: false, error: result.error }, null, 2));
        process.exit(1);
        return;
      }
      console.log(JSON.stringify({ ok: true, capabilityId: result.capabilityId, evidencePath: result.evidencePath }, null, 2));
      return;
    }
    case "invoke": {
      const capability = argv[1];
      if (!capability) usage();
      const options = parseArgs(argv.slice(2));
      const input = typeof options.input === "string" ? options.input : "";
      if (!input) {
        console.error("Missing --input");
        process.exit(1);
        return;
      }
      const inputKind = (typeof options["input-kind"] === "string" ? options["input-kind"] : "path") as
        | "path"
        | "inline";
      const outputPath = typeof options.output === "string" ? options.output : undefined;
      const result = await invokeCapability(baseDir, capability, {
        input,
        inputKind,
        outputPath,
      });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exit(1);
      }
      return;
    }
    case "report": {
      const capability = argv[1];
      const options = parseArgs(argv.slice(2));
      const outcome = typeof options.outcome === "string" ? options.outcome : "";
      const note = typeof options.note === "string" ? options.note : "";
      if (!capability || !outcome || !note) {
        console.error("Missing required args");
        process.exit(1);
        return;
      }
      try {
        const path = appendOutcome(baseDir, capability, { outcome: outcome as "success" | "partial" | "failure", note });
        console.log(JSON.stringify({ ok: true, path }, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to append outcome";
        console.error(JSON.stringify({ ok: false, error: message }, null, 2));
        process.exit(1);
      }
      return;
    }
    default:
      usage();
  }
}

void main();
