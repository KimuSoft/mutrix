import type { LayoutNode } from "./layout";

export const FOLDER_COLUMN_WIDTH = 48;
export interface ColumnGeometry {
  positions: Map<string, { start: number; end: number }>;
  scale: number;
  width: number;
}

/** Each branch reserves fixed folder widths; only file/scope widths stretch to fit. */
export function fitColumns(root: LayoutNode, viewportWidth: number): ColumnGeometry {
  const spans = new Map<
    LayoutNode,
    { fixed: number; flexible: number; level: number; width: number; folder: boolean }
  >();
  let stretch = Infinity;
  root.eachBefore((node) => {
    const parent = node.parent ? spans.get(node.parent)! : undefined;
    const fixed = parent ? parent.fixed + (parent.folder ? parent.width : 0) : 0;
    const flexible = parent ? parent.flexible + (parent.folder ? 0 : parent.width) : 0;
    const level = parent ? parent.level + (parent.folder ? 0 : 1) : 0;
    const folder = node.data.node.kind === "project" || node.data.node.kind === "folder";
    const width = folder ? FOLDER_COLUMN_WIDTH : Math.max(120, 200 - level * 20);
    spans.set(node, { fixed, flexible, level, width, folder });
    const endFixed = fixed + (folder ? width : 0);
    const endFlexible = flexible + (folder ? 0 : width);
    if (endFlexible) stretch = Math.min(stretch, (viewportWidth - endFixed) / endFlexible);
  });
  stretch = Number.isFinite(stretch) ? Math.max(1, stretch) : 1;
  const positions: ColumnGeometry["positions"] = new Map();
  let width = 0;
  for (const [node, span] of spans) {
    const start = span.fixed + span.flexible * stretch;
    const end = start + span.width * (span.folder ? 1 : stretch);
    positions.set(node.data.node.id, { start, end });
    width = Math.max(width, end);
  }
  return { positions, scale: 1, width };
}

export function miniatureColumns(columns: ColumnGeometry, width: number): ColumnGeometry {
  return { ...columns, scale: width / columns.width, width };
}
