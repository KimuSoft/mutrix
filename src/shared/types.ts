export type NodeKind = "project" | "folder" | "file" | "scope" | "residual";
export type ChangeStatus = "unchanged" | "modified" | "added" | "deleted";
export interface SourceRange {
  startLine: number;
  endLine: number;
}
export interface FunctionSignature {
  parameters: { name: string; type: string; optional: boolean; rest: boolean }[];
  returnType: string;
}
export interface PackageSnapshot {
  name?: string;
  kind?: "cargo";
}
export interface ReportNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  path: string;
  symbolKind?: string;
  documentation?: { before?: string; after?: string };
  signature?: { before?: FunctionSignature; after?: FunctionSignature };
  package?: { before?: PackageSnapshot; after?: PackageSnapshot };
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
  /** Present only in the derived planning view; snapshot metrics remain untouched. */
  plan?: { virtual?: boolean; estimated?: boolean; proposedSignature?: boolean };
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
    generatedExclusions?: GeneratedExclusion[];
  };
  rootId: string;
  nodes: ReportNode[];
  diagnostics: Diagnostic[];
  plan?: SummaryDocument;
}
export interface GeneratedExclusion {
  path: string;
  attribute: "linguist-generated";
  snapshots: ("baseline" | "current")[];
}
export interface SummaryDocument {
  schemaVersion: 1;
  mode?: "plan";
  entries: SummaryEntry[];
}
export interface SummaryEntry {
  nodeId: string;
  summary: string;
  plan?: {
    delta?: number;
    signature?: {
      parameters: { name: string; type: string; optional?: boolean; rest?: boolean }[];
      returnType: string;
    };
  };
  create?: { parentId: string; kind: "folder" | "file" | "scope"; name: string; path: string };
}
export interface AnalyzeOptions {
  path: string;
  base?: string;
  exclude?: string[];
  omit?: string[];
  includeGenerated?: boolean;
}
