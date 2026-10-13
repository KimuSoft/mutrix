import type { ReportNode } from "../../shared/types";

export function editorUri(rootPath: string, node: ReportNode): string | undefined {
  if (node.status === "deleted") return undefined;
  const absolute = `${rootPath.replace(/[\\/]$/, "")}${node.path ? `/${node.path}` : ""}`.replace(
    /\\/g,
    "/",
  );
  const line = node.afterRange?.startLine;
  return `vscode://file/${absolute.split("/").map(encodeURIComponent).join("/")}${line ? `:${line}` : ""}`;
}
