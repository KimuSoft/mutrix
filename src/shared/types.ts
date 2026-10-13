export type NodeKind = "project" | "folder" | "file" | "scope" | "residual";
export type ChangeStatus = "unchanged" | "modified" | "added" | "deleted";
export interface SourceRange {
  startLine: number;
  endLine: number;
}
export interface ReportNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  path: string;
  symbolKind?: string;
  documentation?: { before?: string; after?: string };
  package?: { before?: { name?: string }; after?: { name?: string } };
  beforeRange?: SourceRange;
  afterRange?: SourceRange;
  beforeLoc: number;
  afterLoc: number;
  delta: number;
  added: number;
  removed: number;
  status: ChangeStatus;
  weight: number;
  children: string[];
  summary?: string;
  rename?: { path: string; nodeId: string };
}
export interface Diagnostic {
  level: "info" | "warning";
  message: string;
  path?: string;
}
export interface Report {
  schemaVersion: 1;
  meta: {
    name: string;
    rootPath: string;
    generatedAt: string;
    mode: "structure" | "changes";
    branch?: string;
    baseRef?: string;
    baseCommit?: string;
    headCommit?: string;
    excluded: string[];
    files: number;
  };
  rootId: string;
  nodes: ReportNode[];
  diagnostics: Diagnostic[];
}
export interface SummaryDocument {
  schemaVersion: 1;
  entries: { nodeId: string; summary: string }[];
}
export interface AnalyzeOptions {
  path: string;
  base?: string;
  exclude?: string[];
  omit?: string[];
}
