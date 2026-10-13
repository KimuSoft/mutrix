import { color } from "d3-color";
import type { FunctionSignature } from "../../shared/types";
import type { DrawItem } from "./lod";
import type { ChartCamera } from "./camera";
import { nodeFill } from "../../shared/colors";
import type { ColumnGeometry } from "./columns";
import { fileIcon } from "../lib/file-icons";
import { fitText, wrapText, nodeBadges, folderHasDescription, type NodeBadgeLabel } from "./labels";

function badgesWidth(ctx: CanvasRenderingContext2D, labels: NodeBadgeLabel[]): number {
  ctx.save();
  ctx.font = '600 9px "SUIT Variable", system-ui, sans-serif';
  const width = labels.reduce((sum, label) => sum + ctx.measureText(label).width + 12, 0);
  ctx.restore();
  return labels.length ? width - 4 : 0;
}

function paintBadges(
  ctx: CanvasRenderingContext2D,
  labels: NodeBadgeLabel[],
  x: number,
  y: number,
  dark: boolean,
) {
  for (const label of labels) x += paintBadge(ctx, label, x, y, dark) + 4;
}

function paintInfo(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(6, 6, 5, 0, Math.PI * 2);
  ctx.moveTo(6, 6);
  ctx.lineTo(6, 9);
  ctx.stroke();
  ctx.fillRect(5.5, 3, 1, 1);
  ctx.restore();
}

function paintBadge(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  dark: boolean,
) {
  ctx.save();
  ctx.font = '600 9px "SUIT Variable", system-ui, sans-serif';
  const width = ctx.measureText(label).width + 8;
  const warning = label === "WARN";
  if (warning) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark ? "#facc15" : "#fde047";
  } else ctx.globalAlpha *= 0.14;
  ctx.beginPath();
  ctx.roundRect(x, y - 11, width, 15, 3);
  ctx.fill();
  if (warning) {
    ctx.strokeStyle = dark ? "#ca8a04" : "#eab308";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#422006";
  } else ctx.globalAlpha /= 0.14;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, x + 4, y);
  ctx.restore();
  return width;
}

const iconPaths = new Map<string, Path2D>();
const folderShape =
  "M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z";
const packageShape = "M12 3 21 8v9l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5V15";

function paintFolderIcon(ctx: CanvasRenderingContext2D, packaged: boolean, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(14 / 24, 14 / 24);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1.65;
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(packaged ? packageShape : folderShape));
  ctx.restore();
}

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
    if (icon.stroke) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.65;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(shape);
    } else ctx.fill(shape);
  } else {
    // Plain document fallback, matching Lucide's File outline in the tree.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.65;
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6"));
  }
  ctx.restore();
}

function paintTypeRow(
  ctx: CanvasRenderingContext2D,
  name: string,
  type: string,
  x: number,
  y: number,
  width: number,
) {
  const label = fitText(ctx, name, width * 0.45);
  ctx.fillText(label, x, y);
  const badgeX = x + ctx.measureText(label).width + 6;
  ctx.save();
  ctx.font = '500 10px "SUIT Variable", system-ui, sans-serif';
  const text = fitText(ctx, type, x + width - badgeX - 8);
  const badgeWidth = ctx.measureText(text).width + 8;
  const opacity = ctx.globalAlpha;
  ctx.beginPath();
  ctx.roundRect(badgeX, y - 12, badgeWidth, 17, 3);
  ctx.globalAlpha = opacity * 0.09;
  ctx.fill();
  ctx.globalAlpha = opacity * 0.22;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = opacity;
  ctx.fillText(text, badgeX + 4, y);
  ctx.restore();
}

function paintSignature(
  ctx: CanvasRenderingContext2D,
  signature: FunctionSignature,
  x: number,
  y: number,
  width: number,
  maxRows: number,
): number {
  if (maxRows < 3) return y;
  const compact = (text: string) => text.replace(/\s+/g, " ").trim();
  const parameters = signature.parameters.map((parameter) => ({
    name: `${parameter.rest ? "..." : ""}${compact(parameter.name)}${parameter.optional ? "?" : ""}`,
    type: compact(parameter.type),
  }));
  const slots = maxRows - 1;
  const rows = parameters.length ? parameters.slice(0, slots) : [{ name: "인자 없음", type: "" }];
  if (parameters.length > slots)
    rows[slots - 1] = { name: `… ${parameters.length - slots + 1}개 인자`, type: "" };
  rows.forEach((row, index) => {
    if (row.type) paintTypeRow(ctx, row.name, row.type, x, y + index * 20, width);
    else ctx.fillText(fitText(ctx, row.name, width), x, y + index * 20);
  });
  const returnY = y + rows.length * 20 + 12;
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, returnY - 20);
  ctx.lineTo(x + width, returnY - 20);
  ctx.stroke();
  ctx.restore();
  paintTypeRow(ctx, "return", compact(signature.returnType), x, returnY, width);
  return returnY + 22;
}

export interface PaintOptions {
  width: number;
  height: number;
  columns: ColumnGeometry;
  lineScale: number;
  camera: ChartCamera;
  dark: boolean;
  changes: boolean;
  warnLoc?: number;
  selected?: string;
  hovered?: string;
}
export function itemRect(item: DrawItem, options: PaintOptions) {
  const { camera: t, columns, lineScale: sy } = options;
  return {
    x: item.y0 * columns.scale * t.kx + t.x,
    y: item.x0 * sy * t.ky + t.y,
    width: (item.y1 - item.y0) * columns.scale * t.kx,
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
    const contextColumn =
      !item.aggregate && (node.kind === "project" || node.kind === "folder") && !node.package;
    if (h < 18 || (w < 65 && !contextColumn)) continue;
    const text = item.aggregate ? `${item.nodes.length} 영역` : node.name;
    const data = item.nodes[0].data;
    const badges = !item.aggregate
      ? nodeBadges(node, changes, options.warnLoc, data.afterLoc - data.beforeLoc)
      : [];
    const info = !item.aggregate && !node.package && folderHasDescription(node);
    const documentation =
      node.status === "deleted" ? node.documentation?.before : node.documentation?.after;
    const description =
      !item.aggregate && (node.package || (node.kind !== "folder" && node.kind !== "project"))
        ? [node.summary && `변경: ${node.summary}`, documentation].filter(Boolean).join("\n")
        : "";
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
        const current = data.afterLoc.toLocaleString();
        const loc = changes ? "" : `${current} LOC`;
        const nameWidth = ctx.measureText(text).width;
        const folderBadges = h >= 110 ? badges : [];
        const badgeSpace = folderBadges.length ? badgesWidth(ctx, folderBadges) + 6 : 0;
        const infoSpace = info ? 18 : 0;
        ctx.font = '10px "SUIT Variable", system-ui, sans-serif';
        const locWidth = ctx.measureText(loc).width;
        const showLoc = !!loc && 20 + nameWidth + badgeSpace + infoSpace + 8 + locWidth <= h - 16;
        ctx.font = '500 12px "SUIT Variable", system-ui, sans-serif';
        const label = fitText(ctx, text, h - 36 - badgeSpace - infoSpace);
        const labelWidth = ctx.measureText(label).width;
        const start =
          -(20 + labelWidth + badgeSpace + infoSpace + (showLoc ? 8 + locWidth : 0)) / 2;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = '500 12px "SUIT Variable", system-ui, sans-serif';
        paintFolderIcon(ctx, !!node.package, start, -7);
        ctx.fillText(label, start + 20, 0);
        paintBadges(ctx, folderBadges, start + 20 + labelWidth + 6, 3, dark);
        if (info) paintInfo(ctx, start + 20 + labelWidth + badgeSpace + 4, -6);
        ctx.font = '10px "SUIT Variable", system-ui, sans-serif';
        ctx.fillStyle = foreground === "#fafafa" ? "#d4d4d4" : dark ? "#a3a3a3" : "#737373";
        if (showLoc) ctx.fillText(loc, start + 20 + labelWidth + badgeSpace + infoSpace + 8, 0);
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
    const fileLike = node.kind === "file" || !!node.package;
    const labelX = x + (!item.aggregate && fileLike ? 30 : 10);
    const labelText = !item.aggregate && !fileLike ? `${icon}  ${text}` : text;
    const badgeWidth = badgesWidth(ctx, badges);
    const infoSpace = info ? 16 : 0;
    const horizontalBadges = w >= badgeWidth + 80 + infoSpace ? badges : [];
    const label = fitText(
      ctx,
      labelText,
      right - labelX - (horizontalBadges.length ? badgeWidth + 15 : 10) - infoSpace,
    );
    if (!item.aggregate && fileLike) {
      if (node.package) paintFolderIcon(ctx, true, x + 10, baseline - 12);
      else paintFileIcon(ctx, node.path, x + 10, baseline - 12);
    }
    ctx.fillText(label, labelX, baseline);
    paintBadges(ctx, horizontalBadges, labelX + ctx.measureText(label).width + 7, baseline, dark);
    if (info)
      paintInfo(
        ctx,
        labelX + ctx.measureText(label).width + (horizontalBadges.length ? badgeWidth + 4 : 4),
        baseline - 10,
      );
    if (h >= 38) {
      ctx.globalAlpha = (changes && unchanged ? 0.38 : 0.8) * textOpacity;
      ctx.font = '11px "SUIT Variable", system-ui, sans-serif';
      const lines =
        changes && !item.aggregate && fileLike
          ? `${data.beforeLoc.toLocaleString()} → ${data.afterLoc.toLocaleString()} LOC`
          : `${(item.aggregate ? item.nodes.reduce((sum, n) => sum + n.data.afterLoc, 0) : data.afterLoc).toLocaleString()} LOC`;
      ctx.fillText(lines, x + 10, y + 36);
    }
    let bodyY = y + 53;
    if (!item.aggregate && w >= 100 && h >= 108) {
      const signature = node.status === "deleted" ? node.signature?.before : node.signature?.after;
      if (signature) {
        ctx.font = '11px "SUIT Variable", system-ui, sans-serif';
        ctx.globalAlpha = (changes && unchanged ? 0.65 : 0.85) * textOpacity;
        bodyY = paintSignature(
          ctx,
          signature,
          x + 10,
          bodyY,
          w - 20,
          Math.min(8, Math.floor((h - 65) / 20)),
        );
      }
    }
    if (description && w >= 100 && bottom - bodyY >= 15) {
      ctx.font = '11px "SUIT Variable", system-ui, sans-serif';
      ctx.globalAlpha = (changes && unchanged ? 0.65 : 0.85) * textOpacity;
      wrapText(ctx, description, w - 20, Math.min(12, Math.floor((bottom - bodyY) / 15))).forEach(
        (line, index) => ctx.fillText(line, x + 10, bodyY + index * 15),
      );
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
