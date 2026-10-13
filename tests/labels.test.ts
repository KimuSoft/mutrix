import { expect, test } from "bun:test";
import { makeNode } from "../src/analysis/tree";
import { fitText, nodeBadges, wrapText, folderHasDescription } from "../src/viewer/chart/labels";

test("badges use existence status rather than LOC, and are hidden in structure mode", () => {
  const file = makeNode("file:a", null, "file", "a", "a");
  file.status = "added";
  expect(nodeBadges(file, true)).toEqual(["NEW"]);
  expect(nodeBadges(file, false)).toEqual([]);
  file.status = "deleted";
  expect(nodeBadges(file, true)).toEqual(["DEL"]);
  file.status = "modified";
  file.beforeLoc = 100;
  file.afterLoc = 0;
  expect(nodeBadges(file, true)).toEqual([]);
  file.kind = "folder";
  file.status = "added";
  expect(nodeBadges(file, true)).toEqual(["NEW"]);
  file.kind = "scope";
  file.status = "deleted";
  expect(nodeBadges(file, true)).toEqual(["DEL"]);
  file.kind = "residual";
  expect(nodeBadges(file, true)).toEqual([]);
});

test("WARN uses current file/scope LOC, is strict, customizable, and independent of change badges", () => {
  const file = makeNode("file:a", null, "file", "a", "a");
  file.status = "added";
  file.afterLoc = 500;
  expect(nodeBadges(file, true)).toEqual(["NEW"]);
  file.afterLoc = 501;
  expect(nodeBadges(file, true)).toEqual(["NEW", "WARN"]);
  expect(nodeBadges(file, false)).toEqual(["WARN"]);
  expect(nodeBadges(file, true, 600)).toEqual(["NEW"]);
  file.status = "deleted";
  file.beforeLoc = 800;
  file.afterLoc = 0;
  expect(nodeBadges(file, true)).toEqual(["DEL"]);
  file.kind = "folder";
  file.status = "unchanged";
  file.afterLoc = 5000;
  expect(nodeBadges(file, true)).toEqual([]);
  file.kind = "scope";
  expect(nodeBadges(file, true)).toEqual(["WARN"]);
});

test("delta badges accompany modifications, but never duplicate NEW or DEL", () => {
  const node = makeNode("file:a", null, "file", "a", "a");
  node.status = "modified";
  node.beforeLoc = 557;
  node.afterLoc = 600;
  node.delta = 43;
  expect(nodeBadges(node, true)).toEqual(["+43", "WARN"]);
  expect(nodeBadges(node, false)).toEqual(["WARN"]);
  expect(nodeBadges(node, true, 500, -3)).toEqual(["−3", "WARN"]);
  node.status = "added";
  expect(nodeBadges(node, true)).toEqual(["NEW", "WARN"]);
  node.status = "deleted";
  node.afterLoc = 0;
  node.delta = -557;
  expect(nodeBadges(node, true)).toEqual(["DEL"]);
  node.status = "modified";
  expect(nodeBadges(node, true)).toEqual(["−557"]);
  node.delta = 0;
  expect(nodeBadges(node, true)).toEqual([]);
});

test("folder information indicator requires an actual explanation", () => {
  const folder = makeNode("folder:a", null, "folder", "a", "a");
  expect(folderHasDescription(folder)).toBe(false);
  folder.summary = " ";
  expect(folderHasDescription(folder)).toBe(false);
  folder.summary = "설명";
  expect(folderHasDescription(folder)).toBe(true);
  folder.kind = "file";
  expect(folderHasDescription(folder)).toBe(false);
});

const measure = {
  measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics,
};
test("node descriptions wrap to their pixel budget without breaking surrogate pairs", () => {
  const english = wrapText(measure, "alpha beta gamma", 100, 5);
  expect(english.join(" ")).toBe("alpha beta gamma");
  expect(wrapText(measure, "첫줄\n다음줄", 100, 3)).toEqual(["첫줄", "다음줄"]);
  for (const text of [
    "가나다라마바사아자차",
    "longIdentifierWithoutSpaces",
    "😃😃😃😃😃😃😃😃😃😃",
    "</script><img src=x>",
  ]) {
    const wrapped = wrapText(measure, text, 40, 2);
    expect(wrapped.length).toBeLessThanOrEqual(2);
    expect(wrapped.every((line) => measure.measureText(line).width <= 40)).toBe(true);
    expect(wrapped.at(-1)).toContain("…");
    expect(wrapped.every((line) => !/[\uD800-\uDFFF]/u.test(line.replace(/😃/g, "")))).toBe(true);
  }
  expect(fitText(measure, "abcdef", 30)).toBe("ab…");
  expect(wrapText(measure, "text", 100, 0)).toEqual([]);
  expect(wrapText(measure, "text", 0, 2)).toEqual([]);
});
