import type { ReportNode } from "./types";

export function growth(node: ReportNode): number {
  if (node.beforeLoc === 0) return node.afterLoc > 0 ? Infinity : 0;
  return (node.afterLoc - node.beforeLoc) / node.beforeLoc;
}
export function percentLabel(node: ReportNode): string {
  if (node.status === "added") return "+∞";
  if (node.status === "deleted") return "잔존 0%";
  const value = growth(node);
  if (value === Infinity) return "+∞";
  if (value === -1) return "잔존 0%";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}
export function nodeFill(node: ReportNode, changes: boolean, dark: boolean): string {
  if (!changes) {
    return dark ? "#404040" : "#d4d4d4";
  }
  if (node.plan) {
    const rate = growth(node);
    if (rate !== 0)
      return planColor(rate > 0 ? "added" : "removed", dark, Math.min(1, Math.abs(rate)));
    return dark ? "#525252" : "#d4d4d4";
  }
  const rate = growth(node);
  if (node.status === "added" || rate > 0) {
    const t = node.status === "added" ? 1 : Math.min(1, Math.abs(rate));
    return mix(dark ? [43, 74, 59] : [211, 238, 216], dark ? [36, 137, 81] : [40, 139, 76], t);
  }
  if (node.status === "deleted" || rate < 0) {
    const t = node.status === "deleted" ? 1 : Math.min(1, Math.abs(rate));
    return mix(dark ? [81, 51, 47] : [250, 221, 213], dark ? [181, 70, 54] : [194, 76, 53], t);
  }
  return dark ? "#525252" : "#d4d4d4";
}
export function planColor(direction: "added" | "removed", dark: boolean, strength = 1): string {
  return direction === "added"
    ? mix(dark ? [38, 49, 74] : [219, 234, 254], dark ? [29, 78, 216] : [37, 99, 235], strength)
    : mix(dark ? [70, 51, 37] : [255, 237, 213], dark ? [166, 95, 43] : [253, 186, 116], strength);
}
function mix(a: number[], b: number[], t: number) {
  return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * t)).join(",")})`;
}
