import { expect, test } from "bun:test";
import { makeNode } from "../src/analysis/tree";
import { editorUri } from "../src/viewer/lib/node-links";

test("editor links encode paths, use current lines and disable deleted files", () => {
  const node = makeNode("file:a", null, "file", "a.ts", "한 글/a #%.ts");
  node.afterRange = { startLine: 1, endLine: 10 };
  expect(editorUri("E:\\repo space\\", node)).toBe(
    "vscode://file/E%3A/repo%20space/%ED%95%9C%20%EA%B8%80/a%20%23%25.ts:1",
  );
  node.status = "deleted";
  expect(editorUri("E:/repo", node)).toBeUndefined();
  node.status = "unchanged";
  node.afterRange = undefined;
  expect(editorUri("/tmp/repo", node)).toBe(
    "vscode://file//tmp/repo/%ED%95%9C%20%EA%B8%80/a%20%23%25.ts",
  );
});
