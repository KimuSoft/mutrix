import { expect, test } from "bun:test";
import { analyzeFile } from "../src/analysis/scopes";
import { ReportTree } from "../src/analysis/tree";

test("signatures preserve declared generic, optional, rest and destructured types", () => {
  const result = analyzeFile(
    "signature.ts",
    `
function format<T>(text: string, options?: TestOptions, ...values: T[]): string { return text; }
const arrow = ({ name }: { name: string }): Promise<string> => Promise.resolve(name);
const expression = function(value: number = 1): number { return value; };
class Box { method(value: number): boolean { return true; } }
function untyped(value) { return value; }
`,
  );
  expect(result.diagnostics).toEqual([]);
  const scopes = new Map(result.scopes.map((scope) => [scope.name, scope.signature]));
  expect(scopes.get("format")).toEqual({
    parameters: [
      { name: "text", type: "string", optional: false, rest: false },
      { name: "options", type: "TestOptions", optional: true, rest: false },
      { name: "values", type: "T[]", optional: false, rest: true },
    ],
    returnType: "string",
  });
  expect(scopes.get("arrow")?.parameters[0].type).toBe("{ name: string }");
  expect(scopes.get("arrow")?.returnType).toBe("Promise<string>");
  expect(scopes.get("expression")?.parameters[0].optional).toBe(true);
  expect(scopes.get("method")?.returnType).toBe("boolean");
  expect(scopes.get("untyped")?.returnType).toBe("unknown");
  expect(scopes.get("untyped")?.parameters[0].type).toBe("unknown");
  expect(scopes.get("Box")).toBeUndefined();
});

test("signature snapshots keep matching IDs and retain deleted function types", () => {
  const before = analyzeFile("a.ts", "function run(value: string): string { return value; }");
  const after = analyzeFile("a.ts", "function run(value: number): number { return value; }");
  const tree = new ReportTree("changes", "signatures");
  tree.addFile("a.ts", before, after);
  const nodes = tree.finish();
  const scope = nodes.find((node) => node.kind === "scope")!;
  expect(scope.signature?.before?.returnType).toBe("string");
  expect(scope.signature?.after?.returnType).toBe("number");
  expect(scope.status).toBe("modified");
  expect(nodes[0].beforeLoc).toBe(1);
  expect(nodes[0].afterLoc).toBe(1);
  const deleted = new ReportTree("changes", "signatures");
  deleted.addFile("a.ts", before);
  const oldScope = deleted.finish().find((node) => node.kind === "scope")!;
  expect(oldScope.id).toBe(scope.id);
  expect(oldScope.signature?.before?.parameters[0].type).toBe("string");
  expect(oldScope.signature?.after).toBeUndefined();
});
