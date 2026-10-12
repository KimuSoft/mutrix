import type { Report, ReportNode } from "../src/shared/types";
import { makeNode } from "../src/analysis/tree";

export function benchmarkReport(): Report {
  const nodes: ReportNode[] = [];
  const root = makeNode("project:root", null, "project", "benchmark-100k", "");
  nodes.push(root);
  let remaining = 99999;
  for (let f = 0; remaining > 0; f++) {
    const path = `module-${f.toString().padStart(4, "0")}.ts`;
    const file = makeNode(`file:${path}`, root.id, "file", path, path);
    nodes.push(file);
    root.children.push(file.id);
    remaining--;
    const count = Math.min(99, remaining);
    for (let s = 0; s < count; s++) {
      const scope = makeNode(`scope:${path}#function:fn${s}~1`, file.id, "scope", `fn${s}`, path);
      scope.symbolKind = "function";
      scope.beforeLoc = 10;
      scope.afterLoc = s % 3 === 0 ? 15 : s % 3 === 1 ? 5 : 10;
      scope.delta = scope.afterLoc - 10;
      scope.added = Math.max(0, scope.delta);
      scope.removed = Math.max(0, -scope.delta);
      scope.weight = Math.max(scope.beforeLoc, scope.afterLoc);
      scope.status = scope.delta ? "modified" : "unchanged";
      nodes.push(scope);
      file.children.push(scope.id);
      remaining--;
      file.beforeLoc += scope.beforeLoc;
      file.afterLoc += scope.afterLoc;
      file.added += scope.added;
      file.removed += scope.removed;
      file.weight += scope.weight;
    }
    file.delta = file.afterLoc - file.beforeLoc;
    file.status = "modified";
    root.beforeLoc += file.beforeLoc;
    root.afterLoc += file.afterLoc;
    root.added += file.added;
    root.removed += file.removed;
    root.weight += file.weight;
  }
  root.delta = root.afterLoc - root.beforeLoc;
  root.status = "modified";
  return {
    schemaVersion: 1,
    rootId: root.id,
    nodes,
    diagnostics: [],
    meta: {
      name: root.name,
      rootPath: "C:\\benchmark",
      generatedAt: new Date().toISOString(),
      mode: "changes",
      branch: "benchmark",
      baseRef: "main",
      files: root.children.length,
      excluded: [],
    },
  };
}
