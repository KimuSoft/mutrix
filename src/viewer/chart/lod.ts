import type { LayoutNode } from "./layout";

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
}

/** Traverse only visible branches; contiguous subpixel siblings share one draw item. */
export function visibleItems(root: LayoutNode, view: ViewBounds): DrawItem[] {
  const items: DrawItem[] = [];
  const overlaps = (node: LayoutNode) => node.x1 >= view.top && node.x0 <= view.bottom;
  const draw = (nodes: LayoutNode[], aggregate: boolean) => {
    const first = nodes[0],
      last = nodes.at(-1)!;
    if (first.y1 < view.left || first.y0 > view.right) return;
    items.push({ nodes, x0: first.x0, x1: last.x1, y0: first.y0, y1: first.y1, aggregate });
  };
  const visit = (node: LayoutNode) => {
    if (!overlaps(node) || node.y0 > view.right) return;
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
