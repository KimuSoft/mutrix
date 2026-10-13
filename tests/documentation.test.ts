import { expect, test } from "bun:test";
import { analyzeFile } from "../src/analysis/scopes";
import { ReportTree } from "../src/analysis/tree";

test("attached JSDoc retains tags and covers declarations, assigned functions and members", () => {
  const parsed = analyzeFile(
    "docs.ts",
    `/** 함수 설명.\n * @param value 입력\n * @returns 결과\n */
export function run(value: number) { return value; }
/** 화살표 설명 */
export const arrow = () => 1;
/** 표현식 설명 */
const expression = function() { return 2; };
/** 클래스 설명 */
class Box {
 /** 생성자 설명 */
 constructor() {}
 /** 메서드 설명 */
 method() { [1].map(() => 1); }
 /** 필드 설명 */
 handler = () => 1;
 /** 접근자 설명 */
 get value() { return 1; }
}
const object = {
 /** 프로퍼티 설명 */
 action: () => 1,
};
/* 일반 주석 */
function plain() {}
`,
  );
  expect(parsed.diagnostics).toEqual([]);
  const docs = new Map(parsed.scopes.map((scope) => [scope.name, scope.jsDoc]));
  expect(docs.get("run")).toBe("함수 설명.\n@param value 입력\n@returns 결과");
  for (const [name, doc] of [
    ["arrow", "화살표"],
    ["expression", "표현식"],
    ["Box", "클래스"],
    ["constructor", "생성자"],
    ["method", "메서드"],
    ["handler", "필드"],
    ["value", "접근자"],
    ["action", "프로퍼티"],
  ])
    expect(docs.get(name)).toBe(`${doc} 설명`);
  expect(docs.get("[1].map callback")).toBeUndefined();
  expect(docs.get("plain")).toBeUndefined();
});

test("documentation changes keep IDs and LOC ownership; deletion retains only baseline docs", () => {
  const before = analyzeFile("a.js", "/** 이전 설명 */\nfunction a() { return 1; }\n");
  const after = analyzeFile("a.js", "/** 새 설명 */\nfunction a() { return 1; }\n");
  const tree = new ReportTree("changes", "docs");
  tree.addFile("a.js", before, after);
  const nodes = tree.finish();
  const scope = nodes.find((node) => node.kind === "scope")!;
  expect(scope.documentation).toEqual({ before: "이전 설명", after: "새 설명" });
  expect(scope.status).toBe("modified");
  expect(scope.delta).toBe(0);
  expect(nodes[0].afterLoc).toBe(2);
  expect(
    nodes.filter((node) => !node.children.length).reduce((sum, node) => sum + node.afterLoc, 0),
  ).toBe(2);
  const deleted = new ReportTree("changes", "docs");
  deleted.addFile("a.js", before);
  expect(deleted.finish().find((node) => node.kind === "scope")!.documentation).toEqual({
    before: "이전 설명",
  });
  const removed = new ReportTree("changes", "docs");
  removed.addFile("a.js", before, analyzeFile("a.js", "\nfunction a() { return 1; }\n"));
  expect(removed.finish().find((node) => node.kind === "scope")!.documentation).toEqual({
    before: "이전 설명",
  });
});
