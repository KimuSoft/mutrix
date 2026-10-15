import type { ReportNode } from "../../shared/types";
import { signed } from "../lib/utils";

export const DEFAULT_WARN_LOC = 500;
export type NodeBadgeLabel = "NEW" | "DEL" | "WARN" | "PLAN" | `${"+" | "−"}${string}`;

export function nodeBadges(
  node: ReportNode,
  changes: boolean,
  warnLoc = DEFAULT_WARN_LOC,
  delta = node.delta,
): NodeBadgeLabel[] {
  if (node.kind === "residual") return [];
  const badges: NodeBadgeLabel[] = [];
  if (changes && node.plan) {
    if (node.plan.virtual) badges.push("NEW");
    if (delta !== 0) badges.push(signed(delta) as NodeBadgeLabel);
    if (!badges.length && (node.summary?.trim() || node.plan.proposedSignature))
      badges.push("PLAN");
    if ((node.kind === "file" || node.kind === "scope") && node.afterLoc > warnLoc)
      badges.push("WARN");
    return badges;
  }
  if (changes && node.status === "added") badges.push("NEW");
  if (changes && node.status === "deleted") badges.push("DEL");
  if (changes && node.status !== "added" && node.status !== "deleted" && delta !== 0)
    badges.push(signed(delta) as NodeBadgeLabel);
  if ((node.kind === "file" || node.kind === "scope") && node.afterLoc > warnLoc)
    badges.push("WARN");
  return badges;
}

export function folderHasDescription(node: ReportNode): boolean {
  const doc = node.status === "deleted" ? node.documentation?.before : node.documentation?.after;
  return (
    (node.kind === "folder" || node.kind === "project") && !!(node.summary?.trim() || doc?.trim())
  );
}

type Measure = Pick<CanvasRenderingContext2D, "measureText">;

export function fitText(ctx: Measure, text: string, width: number): string {
  if (width <= 0) return "";
  if (ctx.measureText(text).width <= width) return text;
  if (ctx.measureText("…").width > width) return "";
  const characters = Array.from(text);
  let low = 0,
    high = characters.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(characters.slice(0, mid).join("") + "…").width <= width) low = mid;
    else high = mid - 1;
  }
  return characters.slice(0, low).join("") + "…";
}

/** Wrap plain text to the available pixel area, including long identifiers and CJK text. */
export function wrapText(ctx: Measure, text: string, width: number, maxLines: number): string[] {
  if (width <= 0 || maxLines < 1) return [];
  const lines: string[] = [];
  let line = "";
  const characters = Array.from(text.replace(/\r\n?/g, "\n"));
  for (let i = 0; i < characters.length; i++) {
    const next = characters[i];
    if (next !== "\n" && ctx.measureText(line + next).width <= width) {
      line += next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(fitText(ctx, line + characters.slice(i).join("").replace(/\n/g, " "), width));
      return lines;
    }
    const space = next === "\n" ? -1 : line.lastIndexOf(" ");
    lines.push((space > 0 ? line.slice(0, space) : line).trimEnd());
    line = next === "\n" ? "" : space > 0 ? line.slice(space + 1) + next : next.trimStart();
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
