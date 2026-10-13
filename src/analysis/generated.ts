import { git, type GitContext } from "./git";
import type { GeneratedExclusion } from "../shared/types";

/** Let Git resolve nested rules, overrides and macros for all candidate paths in one batch. */
async function generatedPaths(
  root: string,
  paths: string[],
  source?: string,
): Promise<Set<string>> {
  const output = await git(
    root,
    [
      "check-attr",
      "--stdin",
      "-z",
      ...(source ? [`--source=${source}`] : []),
      "linguist-generated",
    ],
    false,
    paths.join("\0") + "\0",
  );
  const records = output!.split("\0");
  const result = new Set<string>();
  for (let i = 0; i + 2 < records.length; i += 3) {
    if (records[i + 1] !== "linguist-generated") throw new Error("Invalid Git attribute response.");
    if (records[i + 2] === "set" || records[i + 2] === "true") result.add(records[i]);
  }
  return result;
}

/** Exclude a generated path from both snapshots so classification changes do not inflate the diff. */
export async function generatedExclusions(
  context: GitContext,
  paths: string[],
): Promise<GeneratedExclusion[]> {
  if (!context.isGit || !paths.length) return [];
  try {
    const [current, baseline] = await Promise.all([
      generatedPaths(context.root, paths),
      context.mode === "changes"
        ? generatedPaths(context.root, paths, context.baseCommit!)
        : Promise.resolve(new Set<string>()),
    ]);
    return paths
      .filter((path) => current.has(path) || baseline.has(path))
      .map((path) => ({
        path,
        attribute: "linguist-generated",
        snapshots: [
          ...(baseline.has(path) ? ["baseline" as const] : []),
          ...(current.has(path) ? ["current" as const] : []),
        ],
      }));
  } catch (error) {
    throw new Error(
      `Cannot resolve generated-file attributes: ${error instanceof Error ? error.message : String(error)}. Use a Git version supporting check-attr --source (Git 2.40+) or --include-generated to bypass this filter.`,
    );
  }
}
