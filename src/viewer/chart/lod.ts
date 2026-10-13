import type { LayoutNode } from "./layout";
import type { ColumnGeometry } from "./columns";

export interface DrawItem {
  nodes: LayoutNode[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  aggregate: boolean;
}
export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  pixelsPerLine: number;
  columns?: ColumnGeometry;
}

/** Traverse only visible branches; contiguous subpixel siblings share one draw item. */
export function visibleItems(root: LayoutNode, view: ViewBounds): DrawItem[] {
  const items: DrawItem[] = [];
  const edges = (node: LayoutNode) =>
    view.columns?.positions.get(node.data.node.id) ?? { start: node.y0, end: node.y1 };
  const overlaps = (node: LayoutNode) => node.x1 >= view.top && node.x0 <= view.bottom;
  const draw = (nodes: LayoutNode[], aggregate: boolean) => {
    const first = nodes[0],
      last = nodes.at(-1)!;
    const { start, end } = edges(first);
    if (end < view.left || start > view.right) return;
    items.push({ nodes, x0: first.x0, x1: last.x1, y0: start, y1: end, aggregate });
  };
  const visit = (node: LayoutNode) => {
    if (!overlaps(node) || edges(node).start > view.right) return;
    if ((node.x1 - node.x0) * view.pixelsPerLine > 0) draw([node], false);
    const children = node.children;
    if (!children?.length) return;
    // Partition order is spatially sorted: use binary search to skip offscreen siblings.
    let low = 0,
      high = children.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (children[mid].x1 < view.top) low = mid + 1;
      else high = mid;
    }
    let group: LayoutNode[] = [];
    const flush = () => {
      if (group.length) {
        draw(group, true);
        group = [];
      }
    };
    for (let i = low; i < children.length; i++) {
      const child = children[i];
      if (child.x0 > view.bottom) break;
      if ((child.x1 - child.x0) * view.pixelsPerLine < 2) {
        if (group.length && edges(group[0]).end !== edges(child).end) flush();
        if (child.x1 > child.x0) group.push(child);
      } else {
        flush();
        visit(child);
      }
    }
    flush();
  };
  visit(root);
  return items;
}
