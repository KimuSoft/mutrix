import { test, expect } from "bun:test";
import { demoReport } from "../src/viewer/demo";
import { buildLayout, reportIndex } from "../src/viewer/chart/layout";
import { visibleItems } from "../src/viewer/chart/lod";
import { itemRect } from "../src/viewer/chart/paint";
import { makeNode } from "../src/analysis/tree";
import { fitColumns, miniatureColumns } from "../src/viewer/chart/columns";

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
  expect(widths[0]).toBe(200);
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
  expect(focused.root.y1 - focused.root.y0).toBe(200);
  expect(focused.root.children![0].y1 - focused.root.children![0].y0).toBe(
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
    columns: { positions: new Map(), scale: 1.5, width: layout.width * 1.5 },
    lineScale: 2,
    camera: { x: 37, y: -13, kx: 3, ky: 2 },
    dark: false,
    changes: true,
  });
  expect(rect.x).toBe(file.y0 * 4.5 + 37);
  expect(rect.width).toBe((file.y1 - file.y0) * 4.5);
  expect(rect.y).toBe(file.x0 * 4 - 13);
});

test("all folders stay thin, mixed siblings meet their own children, and minimap shares ratios", () => {
  const report = demoReport();
  const layout = buildLayout(reportIndex(report), report.rootId, filters)!;
  for (const viewport of [300, 900, 1600]) {
    const columns = fitColumns(layout.root, viewport);
    const mini = miniatureColumns(columns, 126);
    for (const node of layout.nodes) {
      const edge = columns.positions.get(node.data.node.id)!;
      if (node.data.node.kind === "folder" || node.data.node.kind === "project")
        expect(edge.end - edge.start).toBe(48);
      else expect(edge.end - edge.start).toBeGreaterThanOrEqual(120);
      if (node.parent)
        expect(edge.start).toBe(columns.positions.get(node.parent.data.node.id)!.end);
      expect((edge.end * mini.scale) / 126).toBeCloseTo(edge.end / columns.width);
    }
  }
  const rootOnly = buildLayout(
    new Map([[report.rootId, { ...report.nodes[0], children: [] }]]),
    report.rootId,
    filters,
  )!;
  expect(fitColumns(rootOnly.root, 1600).width).toBe(48);
});

test("LOD never merges a narrow folder and wide file; positioned culling preserves totals", () => {
  const report = demoReport();
  const layout = buildLayout(reportIndex(report), report.rootId, filters)!;
  const columns = fitColumns(layout.root, 1600);
  const items = visibleItems(layout.root, {
    left: 0,
    right: columns.width,
    top: 0,
    bottom: layout.total,
    pixelsPerLine: 0.001,
    columns,
  });
  const siblings = items.filter((item) => item.nodes[0].parent === layout.root);
  expect(siblings.reduce((sum, item) => sum + item.x1 - item.x0, 0)).toBeCloseTo(layout.total);
  for (const item of siblings) {
    for (const node of item.nodes)
      expect(columns.positions.get(node.data.node.id)!.end).toBe(item.y1);
  }
  const culled = visibleItems(layout.root, {
    left: 200,
    right: 500,
    top: 0,
    bottom: layout.total,
    pixelsPerLine: 10,
    columns,
  });
  expect(culled.length).toBeGreaterThan(0);
  expect(culled.every((item) => item.y1 >= 200 && item.y0 <= 500)).toBe(true);
});
