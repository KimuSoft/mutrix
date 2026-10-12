import type { Diagnostic, ReportNode, SummaryDocument } from "./types";

export function parseSummaries(value: unknown): SummaryDocument {
  if (!value || typeof value !== "object") throw new Error("Summary must be a JSON object.");
  const doc = value as Partial<SummaryDocument>;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    throw new Error("Summary requires schemaVersion: 1 and an entries array.");
  }
  for (const entry of doc.entries) {
    if (
      !entry ||
      typeof entry.nodeId !== "string" ||
      !entry.nodeId ||
      typeof entry.summary !== "string"
    ) {
      throw new Error("Each Summary entry requires a nonempty nodeId and a text summary.");
    }
  }
  return doc as SummaryDocument;
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
