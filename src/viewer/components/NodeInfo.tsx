import { Info } from "lucide-react";
import type { ReportNode } from "../../shared/types";
import { folderHasDescription } from "../chart/labels";

export function NodeInfo({ node }: { node: ReportNode }) {
  const documentation =
    node.status === "deleted" ? node.documentation?.before : node.documentation?.after;
  return folderHasDescription(node) ? (
    <Info size={12} className="node-info" role="img" aria-label="설명 있음">
      <title>{node.summary?.trim() || documentation}</title>
    </Info>
  ) : null;
}
