import { test, expect } from "bun:test";
import { demoReport } from "../src/viewer/demo";
import { buildLayout, reportIndex } from "../src/viewer/chart/layout";
import { visibleItems } from "../src/viewer/chart/lod";
import { itemRect } from "../src/viewer/chart/paint";
import { makeNode } from "../src/analysis/tree";
import {
  fitColumns,
  miniatureColumns,
  projectColumn,
  unprojectColumn,
} from "../src/viewer/chart/columns";

const filters = { changed: false, extension: "", sort: "path" as const };

test("columns taper and stay adjacent without changing LOC; deep columns keep a minimum width", () => {
  const nodes = Array.from({ length: 9 }, (_, depth) => {
    const node = makeNode(
      `depth:${depth}`,
      depth ? `depth:${depth - 1}` : null,
      "scope",
      `depth ${depth}`,
      "file.ts",
    );
    node.children = depth < 8 ? [`depth:${depth + 1}`] : [];
    node.beforeLoc = node.afterLoc = node.weight = 10;
    return node;
  });
  const layout = buildLayout(new Map(nodes.map((node) => [node.id, node])), nodes[0].id, filters)!;
  const widths = layout.nodes.map((node) => node.y1 - node.y0);
  expect(widths[0]).toBe(48);
  expect(widths[1]).toBeGreaterThan(widths[2]);
  expect(widths[2]).toBeGreaterThan(widths[3]);
  expect(Math.min(...widths.slice(1))).toBe(120);
  expect(widths.at(-1)).toBe(widths.at(-2));
  for (const node of layout.nodes) {
    expect(node.x1 - node.x0).toBe(10);
    if (node.parent) expect(node.y0).toBe(node.parent.y1);
  }
  expect(layout.width).toBe(layout.nodes.at(-1)!.y1);
  expect(layout.total).toBe(10);
});

test("focusing a deep file restarts widths at depth zero and keeps source metrics intact", () => {
  const report = demoReport(),
    index = reportIndex(report);
  const before = JSON.stringify(report);
  const whole = buildLayout(index, report.rootId, filters)!;
  const fileId = "file:src/editor/commands.ts";
  const original = whole.nodes.find((node) => node.data.node.id === fileId)!;
  const focused = buildLayout(index, fileId, filters)!;
  expect(focused.root.y0).toBe(0);
  expect(focused.root.y1).toBe(whole.root.y1);
  expect(focused.root.y1 - focused.root.y0).toBe(48);
  expect(focused.root.children![0].y1 - focused.root.children![0].y0).toBeGreaterThan(
    original.children![0].y1 - original.children![0].y0,
  );
  expect(focused.total).toBe(original.data.weight);
  expect(focused.root.data.afterLoc).toBe(original.data.afterLoc);
  expect(JSON.stringify(report)).toBe(before);
});

test("painting, hit rectangles and horizontal culling agree after zoom and pan", () => {
  const report = demoReport();
  const layout = buildLayout(reportIndex(report), report.rootId, filters)!;
  const file = layout.nodes.find((node) => node.data.node.id === "file:src/editor/commands.ts")!;
  const items = visibleItems(layout.root, {
    left: file.y0 + 1,
    right: file.y1 - 1,
    top: file.x0,
    bottom: file.x1,
    pixelsPerLine: 10,
  });
  expect(items.every((item) => item.y1 >= file.y0 && item.y0 <= file.y1)).toBe(true);
  const item = items.find((item) => item.nodes[0] === file)!;
  const rect = itemRect(item, {
    width: 800,
    height: 600,
    columns: { rootWidth: 48, childScale: 1.5, width: 48 + (layout.width - 48) * 1.5 },
    lineScale: 2,
    camera: { x: 37, y: -13, kx: 3, ky: 2 },
    dark: false,
    changes: true,
  });
  expect(rect.x).toBe((48 + (file.y0 - 48) * 1.5) * 3 + 37);
  expect(rect.width).toBe((file.y1 - file.y0) * 4.5);
  expect(rect.y).toBe(file.x0 * 4 - 13);
});

test("context column stays thin on wide and leaf-only views; projection and minimap share ratios", () => {
  for (const viewport of [300, 900, 1600]) {
    const columns = fitColumns(848, viewport);
    expect(projectColumn(48, columns)).toBe(48);
    expect(projectColumn(248, columns) - projectColumn(48, columns)).toBeGreaterThanOrEqual(200);
    const mini = miniatureColumns(columns, 126);
    for (const x of [-20, 0, 24, 48, 200, 848, 1000]) {
      expect(unprojectColumn(projectColumn(x, columns), columns)).toBeCloseTo(x);
      expect(projectColumn(x, mini) / 126).toBeCloseTo(projectColumn(x, columns) / columns.width);
    }
  }
  expect(fitColumns(48, 1600).width).toBe(48);
});
