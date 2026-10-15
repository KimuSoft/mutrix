import { expect, test } from "bun:test";
import type { Report, SummaryDocument, SummaryEntry } from "../src/shared/types";
import { makeNode } from "../src/analysis/tree";
import { projectPlan } from "../src/shared/plans";
import { attachDocument, parseSummaries } from "../src/shared/summaries";
import { buildLayout, reportIndex } from "../src/viewer/chart/layout";
import { nodeBadges } from "../src/viewer/chart/labels";
import { nodeFill, planColor } from "../src/shared/colors";
import { editorUri } from "../src/viewer/lib/node-links";
import { renderHtml } from "../src/report/html";
import { paint } from "../src/viewer/chart/paint";
import { visibleItems } from "../src/viewer/chart/lod";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { App } from "../src/viewer/App";

function snapshot(): Report {
  const root = makeNode("project:root", null, "project", "example", "");
  const file = makeNode("file:a.ts", root.id, "file", "a.ts", "a.ts");
  const scope = makeNode("scope:a", file.id, "scope", "a", "a.ts");
  const residual = makeNode("residual:a", file.id, "residual", "기타 코드", "a.ts");
  const deleted = makeNode("file:old.ts", root.id, "file", "old.ts", "old.ts");
  root.children = [file.id, deleted.id];
  file.children = [scope.id, residual.id];
  for (const [node, before, after] of [
    [root, 60, 100],
    [file, 40, 100],
    [scope, 20, 60],
    [residual, 20, 40],
    [deleted, 20, 0],
  ] as const) {
    Object.assign(node, {
      beforeLoc: before,
      afterLoc: after,
      delta: after - before,
      added: Math.max(0, after - before),
      removed: Math.max(0, before - after),
      weight: Math.max(before, after),
      status: after ? "modified" : "deleted",
    });
  }
  return {
    schemaVersion: 1,
    rootId: root.id,
    nodes: [root, file, scope, residual, deleted],
    diagnostics: [],
    meta: {
      name: "example",
      rootPath: "E:/example",
      mode: "changes",
      generatedAt: "2026-10-15T00:00:00Z",
      excluded: [],
      files: 2,
    },
  };
}
const document = (entries: SummaryEntry[]): SummaryDocument => ({
  schemaVersion: 1,
  mode: "plan",
  entries,
});
const entry = (nodeId: string, added: number, removed: number): SummaryEntry => ({
  nodeId,
  summary: "계획 설명",
  plan: { added, removed },
});
const filters = { changed: false, extension: "", sort: "path" } as const;

test("planning uses current LOC, keeps actual metrics immutable, and preserves deletion area", () => {
  const report = snapshot();
  const original = JSON.stringify(report);
  const result = projectPlan(report, document([entry("scope:a", 20, 60)]));
  expect(result.diagnostics).toEqual([]);
  const index = reportIndex({ ...report, nodes: result.nodes });
  expect(index.has("file:old.ts")).toBe(false);
  expect(index.get("scope:a")).toMatchObject({
    beforeLoc: 60,
    afterLoc: 20,
    added: 20,
    removed: 60,
    weight: 60,
  });
  expect(index.get(report.rootId)).toMatchObject({ beforeLoc: 100, afterLoc: 60, weight: 100 });
  expect(buildLayout(index, report.rootId, filters)!.total).toBe(100);
  expect(
    buildLayout(index, report.rootId, { ...filters, changed: true })!.root.data.beforeLoc,
  ).toBe(60);
  expect(JSON.stringify(report)).toBe(original);
  const deleted = projectPlan(report, document([entry("file:a.ts", 0, 100)])).nodes.find(
    (node) => node.id === "file:a.ts",
  )!;
  expect(deleted).toMatchObject({ beforeLoc: 100, afterLoc: 0, weight: 100, children: [] });
  expect(nodeFill(deleted, true, false)).toBe(planColor("removed", false));
});

test("new parents resolve in any order; forecasts aggregate without changing file links", () => {
  const report = snapshot();
  const doc = document([
    {
      ...entry("plan:new.ts", 50, 0),
      create: { parentId: "plan:lib", kind: "file", name: "new.ts", path: "lib/new.ts" },
    },
    {
      nodeId: "plan:lib",
      summary: "새 모듈",
      create: { parentId: report.rootId, kind: "folder", name: "lib", path: "lib" },
    },
    entry("file:a.ts", 0, 30),
  ]);
  const result = projectPlan(report, doc);
  expect(result.diagnostics).toEqual([]);
  const index = reportIndex({ ...report, nodes: result.nodes });
  expect(index.get(report.rootId)).toMatchObject({
    beforeLoc: 100,
    afterLoc: 120,
    added: 50,
    removed: 30,
    weight: 150,
  });
  expect(editorUri(report.meta.rootPath, index.get("plan:new.ts")!)).toBeUndefined();
  expect(editorUri(report.meta.rootPath, index.get("file:a.ts")!)).toContain("vscode://");
  const layout = buildLayout(index, report.rootId, { ...filters, extension: ".ts" })!;
  expect(layout.total).toBe(150);
  expect(layout.root.children!.reduce((sum, child) => sum + child.x1 - child.x0, 0)).toBe(150);
  const focused = buildLayout(index, "plan:lib", filters)!;
  expect(focused.total).toBe(50);
});

test("new nested scopes preserve an existing leaf's owned lines", () => {
  const report = snapshot();
  const result = projectPlan(
    report,
    document([
      {
        ...entry("plan:nested", 15, 0),
        create: { parentId: "scope:a", kind: "scope", name: "nested", path: "a.ts" },
      },
    ]),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.nodes.find((node) => node.id === report.rootId)).toMatchObject({
    beforeLoc: 100,
    afterLoc: 115,
    weight: 115,
  });
  expect(result.nodes.find((node) => node.id === "scope:a")!.children).toHaveLength(2);
});

test("a repository with all files deleted can still plan new files at its root", () => {
  const report = snapshot();
  for (const node of report.nodes) Object.assign(node, { afterLoc: 0, status: "deleted" });
  const result = projectPlan(
    report,
    document([
      {
        ...entry("plan:restart", 10, 0),
        create: { parentId: report.rootId, kind: "file", name: "restart.ts", path: "restart.ts" },
      },
    ]),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.nodes.find((node) => node.id === report.rootId)).toMatchObject({
    beforeLoc: 0,
    afterLoc: 10,
    weight: 10,
  });
});

test("description-only plans keep height and are searchable; overlapping estimates prefer children", () => {
  const report = snapshot();
  const result = projectPlan(
    report,
    document([entry("file:a.ts", 100, 0), { nodeId: "scope:a", summary: "규모는 아직 미정" }]),
  );
  expect(result.diagnostics[0].message).toContain("Overlapping");
  const scope = result.nodes.find((node) => node.id === "scope:a")!;
  expect(scope).toMatchObject({ beforeLoc: 60, afterLoc: 60, weight: 60, status: "modified" });
  expect(scope.plan?.estimated).toBeFalsy();
  expect(nodeBadges(scope, true)).toEqual(["PLAN"]);
  expect(result.nodes.find((node) => node.id === report.rootId)!.afterLoc).toBe(100);
  const wholeFile = projectPlan(report, document([{ nodeId: "file:a.ts", summary: "규모 미정" }]));
  const index = reportIndex({ ...report, nodes: wholeFile.nodes });
  expect(buildLayout(index, report.rootId, { ...filters, changed: true })!.total).toBe(100);
});

test("invalid estimates, unknown/duplicate IDs and cyclic parents produce diagnostics", () => {
  const report = snapshot();
  const result = projectPlan(
    report,
    document([
      entry("scope:a", 0, 61),
      entry("scope:a", 50, 0),
      entry("missing", 1, 0),
      {
        ...entry("plan:cycle", 10, 0),
        create: { parentId: "plan:cycle", kind: "folder", name: "cycle", path: "cycle" },
      },
      {
        ...entry("plan:bad", 10, 0),
        create: { parentId: report.rootId, kind: "file", name: "bad.ts", path: "other.ts" },
      },
    ]),
  );
  expect(result.diagnostics).toHaveLength(5);
  expect(result.nodes.find((node) => node.id === report.rootId)!.afterLoc).toBe(100);
  for (const plan of [
    { added: -1, removed: 0 },
    { added: 0.1, removed: 0 },
    { added: Infinity, removed: 0 },
    null,
  ]) {
    expect(() =>
      parseSummaries(document([{ ...entry("scope:a", 0, 0), plan } as SummaryEntry])),
    ).toThrow();
  }
  expect(() =>
    parseSummaries(
      document([
        {
          ...entry("plan:x", 1, 0),
          create: { parentId: report.rootId, kind: "file", name: "x", path: "../x" },
        },
      ]),
    ),
  ).toThrow();
});

test("CLI attachment embeds a plan without overwriting real summaries or unsafe HTML", () => {
  const report = snapshot();
  report.nodes[0].summary = "실제 변경";
  const doc = parseSummaries(
    document([{ ...entry("file:a.ts", 10, 10), summary: "</script><img src=x>" }]),
  );
  const original = JSON.stringify(report.nodes);
  expect(attachDocument(report, doc)).toEqual([]);
  expect(JSON.stringify(report.nodes)).toBe(original);
  const html = renderHtml(
    '<script id="mutrix-data" type="application/json">__MUTRIX_REPORT_DATA__</script>',
    report,
  );
  expect(html).not.toContain("<img");
  const restored = JSON.parse(
    html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>")),
  ) as Report;
  expect(restored.plan).toEqual(doc);
  const node = projectPlan(restored, restored.plan!).nodes.find((node) => node.id === "file:a.ts")!;
  expect(nodeBadges(node, true)).toEqual(["+10", "−10"]);
  expect(node).toMatchObject({ delta: 0, status: "modified", weight: 100 });
  expect(
    attachDocument(report, {
      schemaVersion: 1,
      entries: [{ nodeId: "project:root", summary: "기존 Summary" }],
    }),
  ).toEqual([]);
  expect(report.nodes[0].summary).toBe("기존 Summary");
  expect(report.plan).toEqual(doc);
});

test("zero-LOC virtual nodes remain accessible; existing paths and unsafe totals are rejected", () => {
  const report = snapshot();
  const result = projectPlan(
    report,
    document([
      {
        nodeId: "plan:empty",
        summary: "규모 미정",
        create: { parentId: report.rootId, kind: "file", name: "empty.ts", path: "empty.ts" },
      },
      {
        ...entry("plan:duplicate-path", 10, 0),
        create: { parentId: report.rootId, kind: "file", name: "a.ts", path: "a.ts" },
      },
      entry("scope:a", Number.MAX_SAFE_INTEGER, 0),
    ]),
  );
  expect(result.diagnostics).toHaveLength(2);
  const index = reportIndex({ ...report, nodes: result.nodes });
  expect(index.get("plan:empty")).toMatchObject({ weight: 0, afterLoc: 0, summary: "규모 미정" });
  expect(buildLayout(index, report.rootId, filters)!.total).toBe(100);
});

test("Canvas and LOD retain both planning colors when net change is zero", () => {
  const report = snapshot();
  const { nodes } = projectPlan(report, document([entry("file:a.ts", 10, 10)]));
  const layout = buildLayout(reportIndex({ ...report, nodes }), report.rootId, filters)!;
  const items = visibleItems(layout.root, {
    left: 0,
    right: layout.width,
    top: 0,
    bottom: 100,
    pixelsPerLine: 0.01,
  });
  for (const dark of [true, false]) {
    const fills: { color: string; width: number }[] = [];
    const ctx = {
      fillStyle: "",
      clearRect() {},
      strokeRect() {},
      fillRect(_x: number, _y: number, width: number) {
        fills.push({ color: this.fillStyle, width });
      },
    };
    paint(ctx as unknown as CanvasRenderingContext2D, items, {
      width: 500,
      height: 10,
      columns: { scale: 1, width: layout.width, positions: new Map() },
      lineScale: 0.1,
      camera: { x: 0, y: 0, kx: 1, ky: 1 },
      changes: true,
      dark,
    });
    for (const direction of ["added", "removed"] as const)
      expect(
        fills.some((fill) => fill.color === planColor(direction, dark) && fill.width > 0),
      ).toBe(true);
  }
});

test("embedded plans render the Plan view, estimated totals and current snapshot context", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: 1440, matchMedia: () => ({ matches: false }) },
  });
  try {
    const report = snapshot();
    attachDocument(report, document([entry("file:a.ts", 10, 20)]));
    const markup = renderToStaticMarkup(createElement(App, { initialReport: report }));
    expect(markup).toContain('class="active" title="계획 JSON');
    expect(markup).toContain("현재 스냅샷 → 계획 · 추정");
    expect(markup).toContain("estimated lines");
    expect(markup).toContain("계획 표시 LOC · 추정");
    expect(markup).toContain("예정 추가");
    expect(markup).toContain("예정 삭제");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
