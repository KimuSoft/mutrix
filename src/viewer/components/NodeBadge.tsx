import type { ReportNode } from "../../shared/types";
import { nodeBadges } from "../chart/labels";

export function NodeBadge({
  node,
  changes,
  warnLoc,
}: {
  node: ReportNode;
  changes: boolean;
  warnLoc?: number;
}) {
  return nodeBadges(node, changes, warnLoc).map((label) => (
    <span key={label} className={`node-badge ${label === "WARN" ? "warning" : node.status}`}>
      {label}
    </span>
  ));
}
