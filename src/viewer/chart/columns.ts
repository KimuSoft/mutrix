import type { LayoutNode } from "./layout";

export const FOLDER_COLUMN_WIDTH = 48;
export const FILE_COLUMN_WIDTH = 200;
export const SYMBOL_COLUMN_WIDTH = FILE_COLUMN_WIDTH / 2;
export interface ColumnGeometry {
  positions: Map<string, { start: number; end: number }>;
  scale: number;
  width: number;
}

/** Each branch reserves fixed folder widths; package/file/scope widths stretch to fit. */
export function fitColumns(root: LayoutNode, viewportWidth: number): ColumnGeometry {
  const spans = new Map<
    LayoutNode,
    { fixed: number; flexible: number; width: number; folder: boolean }
  >();
  let stretch = Infinity;
  root.eachBefore((node) => {
    const parent = node.parent ? spans.get(node.parent)! : undefined;
    const fixed = parent ? parent.fixed + (parent.folder ? parent.width : 0) : 0;
    const flexible = parent ? parent.flexible + (parent.folder ? 0 : parent.width) : 0;
    const reportNode = node.data.node;
    const folder =
      (reportNode.kind === "project" || reportNode.kind === "folder") && !reportNode.package;
    const width = folder
      ? FOLDER_COLUMN_WIDTH
      : reportNode.kind === "file" || reportNode.package
        ? FILE_COLUMN_WIDTH
        : SYMBOL_COLUMN_WIDTH;
    spans.set(node, { fixed, flexible, width, folder });
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
