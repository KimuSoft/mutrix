import { describe, expect, test } from "bun:test";
import { analyzeFile } from "../src/analysis/scopes";
import { physicalLines, changedLines } from "../src/analysis/lines";
import { ReportTree } from "../src/analysis/tree";
import { nodeFill, growth, percentLabel } from "../src/shared/colors";
import { fileFilter, DEFAULT_EXCLUDES, decodeText } from "../src/analysis/files";

function compare(before: string | undefined, after: string | undefined, path = "src/a.ts") {
  const tree = new ReportTree("changes", "test");
  tree.addFile(
    path,
    before === undefined ? undefined : analyzeFile(path, before),
    after === undefined ? undefined : analyzeFile(path, after),
  );
  return tree.finish();
}

describe("physical lines and ownership", () => {
  test("empty, terminal newline, blank lines and CRLF", () => {
    expect(physicalLines("")).toEqual([]);
    expect(physicalLines("a\n")).toEqual(["a"]);
    expect(physicalLines("a\r\n\r\n")).toEqual(["a", ""]);
    expect(changedLines("a\r\n", "a")).toEqual({ added: [], removed: [] });
    expect(changedLines("a\nb\n", "a\nc\nd\n")).toEqual({ added: [1, 2], removed: [1] });
  });
  test("nested functions, arrow functions, class methods and accessors", () => {
    const text = `// comment\nexport class Box {\n constructor() {}\n get value() { return 1; }\n set value(v: number) {}\n method() {\n  const callback = () => {\n   function inner() { return 1; }\n   return inner();\n  };\n  return callback();\n }\n}\n`;
    const parsed = analyzeFile("box.ts", text);
    expect(parsed.diagnostics).toHaveLength(0);
    expect(parsed.loc).toBe(13);
    expect(parsed.scopes.map((scope) => scope.kind)).toEqual([
      "class",
      "constructor",
      "get",
      "set",
      "method",
      "arrow",
      "function",
    ]);
    expect(parsed.scopes.find((scope) => scope.name === "inner")!.parent).toContain(
      "arrow:callback",
    );
    const own =
      parsed.scopes.reduce((sum, scope) => sum + scope.ownLoc, 0) +
      parsed.owners.filter((owner) => owner === null).length;
    expect(own).toBe(parsed.loc);
    expect(parsed.owners[7]).toContain("function:inner");
    const nodes = compare(text, text);
    const root = nodes[0];
    expect(root.beforeLoc).toBe(13);
    expect(root.afterLoc).toBe(13);
    expect(root.weight).toBe(13);
    expect(nodes.filter((n) => !n.children.length).reduce((sum, n) => sum + n.afterLoc, 0)).toBe(
      13,
    );
  });
  test("same line ownership and stable IDs on line shifts", () => {
    const text = "const a = () => 1; const b = () => 2;\n";
    const a = analyzeFile("a.ts", text);
    expect(a.scopes.map((scope) => scope.ownLoc)).toEqual([1, 0]);
    const shifted = analyzeFile("a.ts", `// inserted\n${text}`);
    expect(shifted.scopes.map((scope) => scope.key)).toEqual(a.scopes.map((scope) => scope.key));
    const repeated = analyzeFile("a.ts", "function x() {}\nfunction x() {}\n");
    expect(repeated.scopes.map((scope) => scope.key)).toEqual(["function:x~1", "function:x~2"]);
  });
  test("syntax errors retain file-level LOC", () => {
    const file = analyzeFile("broken.ts", "function broken( {\n");
    expect(file.loc).toBe(1);
    expect(file.scopes).toEqual([]);
    expect(file.diagnostics[0].level).toBe("warning");
  });
});

describe("metrics and exclusions", () => {
  test("emptying an existing file is a modification, not removal of its path", () => {
    const nodes = compare("a\n", "", "src/a.txt");
    const file = nodes.find((node) => node.kind === "file")!;
    expect(file.status).toBe("modified");
    expect(file.afterRange).toEqual({ startLine: 0, endLine: 0 });
    expect(percentLabel(file)).toBe("잔존 0%");
    expect(nodes.find((node) => node.kind === "folder")!.status).toBe("modified");
    expect(percentLabel(compare("", "a\n", "a.txt").find((node) => node.kind === "file")!)).toBe(
      "+∞",
    );
  });
  test("deleted and added nodes keep comparison weight", () => {
    const deleted = compare("function a() {\n return 1;\n}\n", undefined);
    expect(deleted[0].afterLoc).toBe(0);
    expect(deleted[0].weight).toBe(3);
    expect(deleted.find((n) => n.kind === "file")!.status).toBe("deleted");
    expect(deleted[0].removed).toBe(3);
    const added = compare(undefined, "const a = () => 1;\n");
    expect(added[0].added).toBe(1);
    expect(added[0].beforeLoc).toBe(0);
    expect(compare(undefined, "").find((n) => n.kind === "file")!.status).toBe("added");
  });
  test("same LOC changes remain modified without highlighting unrelated own code", () => {
    const nodes = compare(
      "// header\nfunction a() { return 1; }\n",
      "// header\nfunction a() { return 2; }\n",
    );
    expect(nodes[0].delta).toBe(0);
    expect(nodes[0].status).toBe("modified");
    expect(nodes[0].added).toBe(1);
    expect(nodes[0].removed).toBe(1);
    expect(nodes.find((n) => n.id === "residual:file:src/a.ts")!.status).toBe("unchanged");
    const eol = compare("a\r\n", "a\n", "a.txt")[0];
    expect(eol.added).toBe(0);
    expect(eol.status).toBe("modified");
  });
  test("comparison height preserves independent growth and shrinkage", () => {
    const nodes = compare(
      "function a() {\n x();\n y();\n}\nfunction b() {}\n",
      "function a() {}\nfunction b() {\n x();\n y();\n}\n",
    );
    expect(nodes[0].beforeLoc).toBe(5);
    expect(nodes[0].afterLoc).toBe(5);
    expect(nodes[0].weight).toBe(8);
  });
  test("color is relative and saturates at 100%", () => {
    const node = compare("a\n", "a\nb\n", "a.txt")[0];
    expect(growth(node)).toBe(1);
    expect(nodeFill(node, true, false)).toBe(
      nodeFill({ ...node, beforeLoc: 100, afterLoc: 200 }, true, false),
    );
    expect(nodeFill(node, true, false)).not.toBe(
      nodeFill({ ...node, beforeLoc: 100, afterLoc: 101 }, true, false),
    );
    expect(nodeFill(compare(undefined, "a", "a.txt")[0], true, false)).toBe(
      nodeFill(node, true, false),
    );
  });
  test("default directory and output exclusion, binary detection", () => {
    const include = fileFilter("C:/test", DEFAULT_EXCLUDES, ["C:/test/report.html"]);
    expect(include("node_modules/react/index.js")).toBe(false);
    expect(include("packages/a/dist/index.js")).toBe(false);
    expect(include("node_modules")).toBe(false);
    expect(include("bun.lock")).toBe(false);
    expect(include("report.html")).toBe(false);
    expect(include("src/a.ts")).toBe(true);
    expect(decodeText(new Uint8Array([65, 0, 66]))).toBeUndefined();
  });
});
