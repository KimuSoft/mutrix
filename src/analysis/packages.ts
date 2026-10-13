import type { Diagnostic, ReportNode } from "../shared/types";

/** A package boundary is a readable JSON object, including unpublished workspace roots. */
export function packageInfo(
  path: string,
  before: string | undefined,
  after: string | undefined,
  diagnostics: Diagnostic[],
): ReportNode["package"] {
  const parse = (text: string | undefined, snapshot: string) => {
    if (text === undefined) return undefined;
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("object required");
      return typeof value.name === "string" && value.name.trim() ? { name: value.name } : {};
    } catch {
      diagnostics.push({
        level: "warning",
        path,
        message: `${snapshot} package.json is not a valid JSON object; package detection skipped.`,
      });
      return undefined;
    }
  };
  const info = { before: parse(before, "Baseline"), after: parse(after, "Current") };
  return info.before || info.after ? info : undefined;
}
