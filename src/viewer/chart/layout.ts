import { hierarchy, partition, type HierarchyRectangularNode } from "d3-hierarchy";
import type { Report, ReportNode } from "../../shared/types";
import { ROOT_COLUMN_WIDTH } from "./columns";

export interface Filters {
  changed: boolean;
  extension: string;
  sort: "path" | "loc" | "churn";
}
export interface LayoutData {
  node: ReportNode;
  children: LayoutData[];
  beforeLoc: number;
  afterLoc: number;
  added: number;
  removed: number;
  weight: number;
}
export type LayoutNode = HierarchyRectangularNode<LayoutData>;
export interface ChartLayout {
  root: LayoutNode;
  columns: number;
  width: number;
  total: number;
  nodes: LayoutNode[];
}

export function buildLayout(
  index: Map<string, ReportNode>,
  focus: string,
  filters: Filters,
  currentOnly = false,
): ChartLayout | undefined {
  const collect = (id: string): LayoutData | undefined => {
    const node = index.get(id)!;
    const children = node.children.map(collect).filter((child): child is LayoutData => !!child);
    const matches =
      (!filters.changed || node.status !== "unchanged") &&
      (!filters.extension || node.path.endsWith(filters.extension));
    if (node.children.length && children.length === 0 && !matches) return undefined;
    if (!node.children.length && !matches) return undefined;
    // An extension filter must never turn an unrelated empty folder into a leaf.
    if (node.children.length && children.length === 0 && filters.extension) return undefined;
    const aggregate = (key: "beforeLoc" | "afterLoc" | "added" | "removed" | "weight") =>
      node.children.length
        ? children.reduce((sum, child) => sum + child[key], 0)
        : key === "weight" && currentOnly
          ? node.afterLoc
          : node[key];
    children.sort((a, b) => {
      if (filters.sort === "loc")
        return b.afterLoc - a.afterLoc || a.node.name.localeCompare(b.node.name);
      if (filters.sort === "churn")
        return (
          b.added + b.removed - (a.added + a.removed) || a.node.name.localeCompare(b.node.name)
        );
      return a.node.name.localeCompare(b.node.name);
    });
    return {
      node,
      children,
      beforeLoc: aggregate("beforeLoc"),
      afterLoc: aggregate("afterLoc"),
      added: aggregate("added"),
      removed: aggregate("removed"),
      weight: aggregate("weight"),
    };
  };
  const data = collect(focus);
  if (!data) return undefined;
  const tree = hierarchy(data).sum((item) => (item.children.length ? 0 : item.weight));
  const columns = tree.height + 1;
  const root = partition<LayoutData>().size([data.weight || 1, columns])(tree);
  const edges = [0];
  for (let depth = 0; depth < columns; depth++) {
    edges.push(
      edges[depth] + (depth === 0 ? ROOT_COLUMN_WIDTH : Math.max(120, 200 - (depth - 1) * 20)),
    );
  }
  const nodes = root.descendants();
  // Partition depths are relative to the focused root, so drilling in restarts the taper.
  for (const node of nodes) {
    node.y0 = edges[node.depth];
    node.y1 = edges[node.depth + 1];
  }
  return {
    root,
    columns,
    width: edges[columns],
    total: data.weight,
    nodes,
  };
}

export function parentChain(index: Map<string, ReportNode>, id: string): ReportNode[] {
  const result: ReportNode[] = [];
  let node = index.get(id);
  while (node) {
    result.unshift(node);
    node = node.parentId ? index.get(node.parentId) : undefined;
  }
  return result;
}

export function reportIndex(report: Report) {
  return new Map(report.nodes.map((node) => [node.id, node]));
}
