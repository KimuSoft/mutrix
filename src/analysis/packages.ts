import type { Diagnostic, ReportNode, PackageSnapshot } from "../shared/types";

/** Cargo packages require [package].name; a virtual workspace is not itself a crate. */
export function packageInfo(
  path: string,
  before: string | undefined,
  after: string | undefined,
  diagnostics: Diagnostic[],
  previous?: ReportNode["package"],
): ReportNode["package"] {
  const cargo = path.split("/").at(-1) === "Cargo.toml";
  const parse = (text: string | undefined, snapshot: string): PackageSnapshot | undefined => {
    if (text === undefined) return undefined;
    try {
      if (cargo) {
        const value = Bun.TOML.parse(text) as { package?: { name?: unknown } };
        if (value.package === undefined) return undefined;
        const pkg = value.package;
        if (
          !pkg ||
          typeof pkg !== "object" ||
          Array.isArray(pkg) ||
          typeof pkg.name !== "string" ||
          !pkg.name.trim()
        )
          throw new Error("[package].name required");
        return { name: pkg.name, kind: "cargo" };
      }
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("object required");
      return typeof value.name === "string" && value.name.trim() ? { name: value.name } : {};
    } catch {
      diagnostics.push({
        level: "warning",
        path,
        message: cargo
          ? `${snapshot} Cargo.toml is invalid or lacks a nonempty [package].name; crate detection skipped.`
          : `${snapshot} package.json is not a valid JSON object; package detection skipped.`,
      });
      return undefined;
    }
  };
  const info = { before: parse(before, "Baseline"), after: parse(after, "Current") };
  // A crate may also contain JS tooling. Resolve precedence independently for each snapshot.
  for (const snapshot of ["before", "after"] as const) {
    const old = previous?.[snapshot];
    if (old && (old.kind === "cargo" || !info[snapshot])) info[snapshot] = old;
  }
  return info.before || info.after ? info : undefined;
}
