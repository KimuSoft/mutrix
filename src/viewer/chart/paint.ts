import { color } from "d3-color";
import type { DrawItem } from "./lod";
import type { ChartCamera } from "./camera";
import { nodeFill } from "../../shared/colors";
import { signed } from "../lib/utils";
import { projectColumn, type ColumnGeometry } from "./columns";
import { fileIcon } from "../lib/file-icons";

const iconPaths = new Map<string, Path2D>();

function paintFileIcon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number) {
  const icon = fileIcon(path);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(14 / 24, 14 / 24);
  if (icon) {
    let shape = iconPaths.get(icon.slug);
    if (!shape) {
      shape = new Path2D(icon.path);
      iconPaths.set(icon.slug, shape);
    }
    ctx.fill(shape);
  } else {
    // Plain document fallback, matching Lucide's File outline in the tree.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.65;
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6"));
  }
  ctx.restore();
}

export interface PaintOptions {
  width: number;
  height: number;
  columns: ColumnGeometry;
  lineScale: number;
  camera: ChartCamera;
  dark: boolean;
  changes: boolean;
  selected?: string;
  hovered?: string;
}
export function itemRect(item: DrawItem, options: PaintOptions) {
  const { camera: t, columns, lineScale: sy } = options;
  return {
    x: projectColumn(item.y0, columns) * t.kx + t.x,
    y: item.x0 * sy * t.ky + t.y,
    width: (projectColumn(item.y1, columns) - projectColumn(item.y0, columns)) * t.kx,
    height: (item.x1 - item.x0) * sy * t.ky,
  };
}

export function paint(ctx: CanvasRenderingContext2D, items: DrawItem[], options: PaintOptions) {
  const { width, height, dark, changes } = options;
  ctx.clearRect(0, 0, width, height);
  for (const item of items) {
    const rect = itemRect(item, options);
    const node = item.nodes[0].data.node;
    const x = Math.max(0, rect.x + 2),
      y = Math.max(0, rect.y + 0.6);
    const right = Math.min(width, rect.x + rect.width - 2),
      bottom = Math.min(height, rect.y + rect.height - 0.6);
    const w = right - x,
      h = bottom - y;
    if (w <= 0 || h <= 0) continue;
    const unchanged = item.nodes.every((n) => n.data.node.status === "unchanged");
    const residual = item.nodes.every((n) => n.data.node.kind === "residual");
    const selected = item.nodes.some((n) => n.data.node.id === options.selected);
    const hovered = item.nodes.some((n) => n.data.node.id === options.hovered);
    const textOpacity = residual && !selected && !hovered ? 0.5 : 1;
    ctx.globalAlpha = (changes && unchanged ? 0.24 : 1) * (residual ? 0.4 : 1);
    ctx.fillStyle = nodeFill(node, changes, dark);
    ctx.fillRect(x, y, w, h);
    if (item.aggregate) {
      const additions = item.nodes.reduce((sum, n) => sum + n.data.added, 0);
      const removals = item.nodes.reduce((sum, n) => sum + n.data.removed, 0);
      if (changes && additions + removals > 0) {
        const split = (w * additions) / (additions + removals);
        ctx.fillStyle = dark ? "#248951" : "#288b4c";
        ctx.fillRect(x, y, split, h);
        ctx.fillStyle = dark ? "#b54636" : "#c24c35";
        ctx.fillRect(x + split, y, w - split, h);
      }
    }
    if (changes && node.status === "modified" && node.delta === 0 && !item.aggregate) {
      ctx.strokeStyle = dark ? "#a3a3a3" : "#737373";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.globalAlpha = 1;
    if (selected || hovered) {
      ctx.strokeStyle = selected ? (dark ? "#f5f5f5" : "#262626") : dark ? "#a3a3a3" : "#737373";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    const contextColumn = !item.aggregate && item.nodes[0].depth === 0;
    if (h < 18 || (w < 65 && !contextColumn)) continue;
    const text = item.aggregate ? `${item.nodes.length} 영역` : node.name;
    const fill = color(String(ctx.fillStyle));
    const rgb = fill?.rgb();
    const luminance = rgb ? rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 : 160;
    const foreground =
      !residual && !unchanged && changes && luminance < 130
        ? "#fafafa"
        : dark
          ? "#f5f5f5"
          : "#171717";
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 6, y, w - 12, h);
    ctx.clip();
    ctx.globalAlpha = (changes && unchanged ? 0.55 : 1) * textOpacity;
    ctx.fillStyle = foreground;
    ctx.font = '500 12px "SUIT Variable", system-ui, sans-serif';
    if (contextColumn) {
      if (w >= 20 && h >= 60) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        const current = item.nodes[0].data.afterLoc.toLocaleString();
        const loc = changes
          ? `${item.nodes[0].data.beforeLoc.toLocaleString()} → ${current} LOC`
          : `${current} LOC`;
        const nameWidth = ctx.measureText(text).width;
        ctx.font = '10px "SUIT Variable", system-ui, sans-serif';
        const locWidth = ctx.measureText(loc).width;
        const start = -(nameWidth + 8 + locWidth) / 2;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = '500 12px "SUIT Variable", system-ui, sans-serif';
        ctx.fillText(text, start, 0);
        ctx.font = '10px "SUIT Variable", system-ui, sans-serif';
        ctx.fillStyle = foreground === "#fafafa" ? "#d4d4d4" : dark ? "#a3a3a3" : "#737373";
        ctx.fillText(loc, start + nameWidth + 8, 0);
      }
      ctx.restore();
      continue;
    }
    const baseline = h >= 38 ? y + 20 : y + h / 2 + 4;
    const icon =
      node.kind === "folder"
        ? "▱"
        : node.kind === "scope"
          ? "ƒ"
          : node.kind === "project"
            ? "▥"
            : "·";
    if (!item.aggregate && node.kind === "file") {
      paintFileIcon(ctx, node.path, x + 10, baseline - 12);
      ctx.fillText(text, x + 30, baseline);
    } else {
      const label = item.aggregate ? text : `${icon}  ${text}`;
      ctx.fillText(label, x + 10, baseline);
    }
    if (h >= 38) {
      ctx.globalAlpha = (changes && unchanged ? 0.38 : 0.8) * textOpacity;
      ctx.font = '11px "SUIT Variable", system-ui, sans-serif';
      ctx.fillText(
        changes ? `${signed(node.delta)} lines` : `${node.afterLoc.toLocaleString()} lines`,
        x + 10,
        y + 36,
      );
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
