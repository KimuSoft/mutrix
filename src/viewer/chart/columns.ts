export const ROOT_COLUMN_WIDTH = 48;

export interface ColumnGeometry {
  rootWidth: number;
  childScale: number;
  width: number;
}

/** Stretch descendants to fit; the context column stays 48px at the initial zoom. */
export function fitColumns(logicalWidth: number, viewportWidth: number): ColumnGeometry {
  const descendants = logicalWidth - ROOT_COLUMN_WIDTH;
  const childScale =
    descendants > 0 ? Math.max(1, (viewportWidth - ROOT_COLUMN_WIDTH) / descendants) : 1;
  return {
    rootWidth: ROOT_COLUMN_WIDTH,
    childScale,
    width: ROOT_COLUMN_WIDTH + descendants * childScale,
  };
}

export function projectColumn(x: number, columns: ColumnGeometry): number {
  return x <= ROOT_COLUMN_WIDTH
    ? (x / ROOT_COLUMN_WIDTH) * columns.rootWidth
    : columns.rootWidth + (x - ROOT_COLUMN_WIDTH) * columns.childScale;
}

export function unprojectColumn(x: number, columns: ColumnGeometry): number {
  return x <= columns.rootWidth
    ? (x / columns.rootWidth) * ROOT_COLUMN_WIDTH
    : ROOT_COLUMN_WIDTH + (x - columns.rootWidth) / columns.childScale;
}

export function miniatureColumns(columns: ColumnGeometry, width: number): ColumnGeometry {
  const ratio = width / columns.width;
  return { rootWidth: columns.rootWidth * ratio, childScale: columns.childScale * ratio, width };
}
