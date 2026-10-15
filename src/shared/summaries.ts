import type { Diagnostic, Report, ReportNode, SummaryDocument } from "./types";
import { projectPlan } from "./plans";

export function parseSummaries(value: unknown): SummaryDocument {
  if (!value || typeof value !== "object") throw new Error("Summary must be a JSON object.");
  const doc = value as Partial<SummaryDocument>;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    throw new Error("Summary requires schemaVersion: 1 and an entries array.");
  }
  if (doc.mode !== undefined && doc.mode !== "plan") throw new Error("Unknown Summary mode.");
  for (const entry of doc.entries) {
    if (
      !entry ||
      typeof entry.nodeId !== "string" ||
      !entry.nodeId ||
      typeof entry.summary !== "string"
    ) {
      throw new Error("Each Summary entry requires a nonempty nodeId and a text summary.");
    }
    if (
      entry.plan !== undefined &&
      (!entry.plan ||
        typeof entry.plan !== "object" ||
        Array.isArray(entry.plan) ||
        Object.keys(entry.plan).some((key) => key !== "delta" && key !== "signature") ||
        (entry.plan.delta !== undefined && !Number.isSafeInteger(entry.plan.delta)))
    )
      throw new Error("Plan requires a signed integer delta and/or a function signature.");
    if (entry.plan?.signature !== undefined) {
      const signature = entry.plan.signature;
      if (
        !signature ||
        typeof signature !== "object" ||
        typeof signature.returnType !== "string" ||
        !signature.returnType.trim() ||
        !Array.isArray(signature.parameters) ||
        signature.parameters.some(
          (parameter) =>
            !parameter ||
            typeof parameter.name !== "string" ||
            !parameter.name.trim() ||
            typeof parameter.type !== "string" ||
            !parameter.type.trim() ||
            (parameter.optional !== undefined && typeof parameter.optional !== "boolean") ||
            (parameter.rest !== undefined && typeof parameter.rest !== "boolean"),
        )
      )
        throw new Error("A function signature requires named, typed parameters and a returnType.");
    }
    if (entry.create !== undefined) {
      const spec = entry.create;
      if (
        !spec ||
        typeof spec !== "object" ||
        typeof spec.parentId !== "string" ||
        !spec.parentId ||
        !["folder", "file", "scope"].includes(spec.kind) ||
        typeof spec.name !== "string" ||
        !spec.name.trim() ||
        /[\\/:]/.test(spec.name) ||
        [".", ".."].includes(spec.name) ||
        typeof spec.path !== "string" ||
        /[\\:]/.test(spec.path) ||
        spec.path.split("/").some((part) => !part || part === "." || part === "..")
      )
        throw new Error(
          "New plan nodes require parentId, kind, name and a normalized relative path.",
        );
    }
  }
  return doc as SummaryDocument;
}

export function attachDocument(report: Report, doc: SummaryDocument): Diagnostic[] {
  if (doc.mode === "plan" || doc.entries.some((entry) => entry.plan || entry.create)) {
    const { diagnostics } = projectPlan(report, doc);
    report.plan = doc;
    return diagnostics;
  }
  return attachSummaries(report.nodes, doc);
}

export function attachSummaries(nodes: ReportNode[], doc: SummaryDocument): Diagnostic[] {
  const index = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const entry of doc.entries) {
    if (seen.has(entry.nodeId)) {
      diagnostics.push({
        level: "warning",
        message: `Duplicate Summary ID skipped: ${entry.nodeId}`,
      });
      continue;
    }
    seen.add(entry.nodeId);
    const node = index.get(entry.nodeId);
    if (!node)
      diagnostics.push({ level: "warning", message: `Unknown Summary ID: ${entry.nodeId}` });
    else node.summary = entry.summary;
  }
  return diagnostics;
}
