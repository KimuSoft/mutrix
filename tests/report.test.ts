import { test, expect } from "bun:test";
import { attachSummaries, parseSummaries } from "../src/shared/summaries";
import { renderHtml } from "../src/report/html";
import { demoReport } from "../src/viewer/demo";
import { buildLayout, reportIndex } from "../src/viewer/chart/layout";
import { visibleItems } from "../src/viewer/chart/lod";
import { cliOptions } from "../src/cli/args";

test("summary contract, duplicate and unknown diagnostics", () => {
  const report = demoReport();
  const summary = `</script><img src=x onerror=alert(1)>\n& special chars`;
  const doc = parseSummaries({
    schemaVersion: 1,
    entries: [
      { nodeId: "project:root", summary },
      { nodeId: "project:root", summary: "duplicate" },
      { nodeId: "missing", summary: "unknown" },
    ],
  });
  const diagnostics = attachSummaries(report.nodes, doc);
  expect(diagnostics).toHaveLength(2);
  expect(report.nodes[0].summary).toBe(summary);
  expect(() => parseSummaries({ schemaVersion: 2, entries: [] })).toThrow();
  expect(() =>
    parseSummaries({ schemaVersion: 1, entries: [{ nodeId: "a", summary: 1 }] }),
  ).toThrow();
  const html = renderHtml(
    '<script id="mutrix-data" type="application/json">__MUTRIX_REPORT_DATA__</script>',
    report,
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("</script><img");
  const parsed = JSON.parse(html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>")));
  expect(parsed.nodes[0].summary).toBe(summary);
  expect(() => renderHtml("bad template", report)).toThrow();
});

test("layout filtering recalculates totals; structure uses current LOC", () => {
  const report = demoReport(),
    index = reportIndex(report);
  const full = buildLayout(index, report.rootId, { changed: false, extension: "", sort: "path" })!;
  expect(full.total).toBe(report.nodes[0].weight);
  expect(
    buildLayout(index, report.rootId, { changed: false, extension: "", sort: "loc" }, true)!.total,
  ).toBe(report.nodes[0].afterLoc);
  const filtered = buildLayout(index, report.rootId, {
    changed: true,
    extension: ".tsx",
    sort: "churn",
  })!;
  const files = report.nodes.filter(
    (n) => n.kind === "file" && n.path.endsWith(".tsx") && n.status !== "unchanged",
  );
  expect(filtered.root.data.afterLoc).toBe(files.reduce((sum, n) => sum + n.afterLoc, 0));
  expect(
    buildLayout(index, report.rootId, { changed: false, extension: ".missing", sort: "path" }),
  ).toBeUndefined();
});

test("LOD preserves area and separates groups without mutating layout", () => {
  const report = demoReport();
  const layout = buildLayout(reportIndex(report), report.rootId, {
    changed: false,
    extension: "",
    sort: "path",
  })!;
  const before = JSON.stringify(layout.nodes.map((n) => [n.x0, n.x1, n.data.weight]));
  const zoomedOut = visibleItems(layout.root, {
    left: 0,
    right: layout.width,
    top: 0,
    bottom: layout.total,
    pixelsPerLine: 0.001,
  });
  expect(zoomedOut.some((item) => item.aggregate)).toBe(true);
  const zoomedIn = visibleItems(layout.root, {
    left: 0,
    right: layout.width,
    top: 0,
    bottom: layout.total,
    pixelsPerLine: 10,
  });
  expect(zoomedIn.length).toBeGreaterThan(zoomedOut.length);
  expect(JSON.stringify(layout.nodes.map((n) => [n.x0, n.x1, n.data.weight]))).toBe(before);
  const siblings = zoomedOut.filter((item) => item.y0 === layout.root.y1);
  expect(siblings.reduce((sum, item) => sum + item.x1 - item.x0, 0)).toBeCloseTo(layout.total);
});

test("CLI argument paths and exclusions", () => {
  const options = cliOptions([
    ".",
    "--exclude",
    "**/fixtures/**",
    "--exclude",
    "**/*.md",
    "--open",
  ]);
  expect(options.exclude).toEqual(["**/fixtures/**", "**/*.md"]);
  expect(options.open).toBe(true);
  expect(() => cliOptions(["--output", "same", "--json", "same"])).toThrow("must be different");
  expect(() => cliOptions(["a", "b"])).toThrow();
});
