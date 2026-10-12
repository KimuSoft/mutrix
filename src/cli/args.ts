import { parseArgs } from "node:util";
import { resolve } from "node:path";

export const HELP = `Mutrix · Code, in perspective

Usage: mutrix [path] [options]

  --base <ref>         Base reference (auto: master, main, origin/master, origin/main)
  --output <path>      Single HTML report (default: <path>/mutrix-report.html)
  --json <path>        Also export schemaVersion 1 analysis JSON
  --summaries <path>   Attach a Summary JSON document
  --exclude <glob>     Additional exclusion; repeat to add patterns
  --open              Open the generated report in the default browser
  --help              Show usage
  --version           Show version

On the base branch, show structure. Else compare merge-base → working folder.
Git is required for change analysis. Reports work offline without Bun or Node.
`;

export function cliOptions(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      base: { type: "string" },
      output: { type: "string" },
      json: { type: "string" },
      summaries: { type: "string" },
      exclude: { type: "string", multiple: true },
      open: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
  if (positionals.length > 1) throw new Error("Provide only one project path.");
  const path = resolve(positionals[0] ?? process.cwd());
  const output = resolve(values.output ?? resolve(path, "mutrix-report.html"));
  const json = values.json ? resolve(values.json) : undefined;
  const summaries = values.summaries ? resolve(values.summaries) : undefined;
  const distinct = [output, json, summaries]
    .filter((p): p is string => !!p)
    .map((p) => p.toLowerCase());
  if (new Set(distinct).size !== distinct.length)
    throw new Error("Output, JSON, and Summary paths must be different.");
  return { ...values, path, output, json, summaries };
}
