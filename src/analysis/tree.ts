import type { ReportNode, Report } from "../shared/types";
import type { FileAnalysis } from "./scopes";
import { changedLines } from "./lines";

export function makeNode(
  id: string,
  parentId: string | null,
  kind: ReportNode["kind"],
  name: string,
  path: string,
): ReportNode {
  return {
    id,
    parentId,
    kind,
    name,
    path,
    beforeLoc: 0,
    afterLoc: 0,
    delta: 0,
    added: 0,
    removed: 0,
    status: "unchanged",
    weight: 0,
    children: [],
  };
}

export class ReportTree {
  readonly nodes = new Map<string, ReportNode>();
  private changed = new Set<string>();
  constructor(
    private mode: Report["meta"]["mode"],
    name: string,
  ) {
    this.nodes.set("project:root", makeNode("project:root", null, "project", name, ""));
  }

  private add(node: ReportNode) {
    if (this.nodes.has(node.id)) return this.nodes.get(node.id)!;
    this.nodes.set(node.id, node);
    if (node.parentId) this.nodes.get(node.parentId)!.children.push(node.id);
    return node;
  }

  addFile(path: string, before?: FileAnalysis, after?: FileAnalysis) {
    const parts = path.split("/");
    let parent = "project:root";
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      parent = this.add(
        makeNode(`folder:${folderPath}`, parent, "folder", parts[i], folderPath),
      ).id;
    }
    const file = this.add(makeNode(`file:${path}`, parent, "file", parts.at(-1)!, path));
    const scopes = new Map(
      [...(before?.scopes ?? []), ...(after?.scopes ?? [])].map((scope) => [scope.key, scope]),
    );
    const oldScopes = new Map(before?.scopes.map((scope) => [scope.key, scope]) ?? []);
    const newScopes = new Map(after?.scopes.map((scope) => [scope.key, scope]) ?? []);
    const ownChanged = new Set<string>();
    // Both snapshots were traversed preorder, so parent scopes are available first.
    for (const [key, scope] of scopes) {
      const node = this.add(
        makeNode(
          `scope:${path}#${key}`,
          scope.parent ? `scope:${path}#${scope.parent}` : file.id,
          "scope",
          scope.name,
          path,
        ),
      );
      node.symbolKind = scope.kind;
      node.beforeRange = oldScopes.get(key)?.range;
      node.afterRange = newScopes.get(key)?.range;
      const beforeDoc = oldScopes.get(key)?.jsDoc;
      const afterDoc = newScopes.get(key)?.jsDoc;
      if (beforeDoc || afterDoc) node.documentation = { before: beforeDoc, after: afterDoc };
    }
    const ownerId = (owner: string | null) => (owner ? `scope:${path}#${owner}` : file.id);
    for (const analysis of [before, after]) {
      if (!analysis) continue;
      const counts = new Map<string, number>();
      for (const owner of analysis.owners) {
        const id = ownerId(owner);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const [id, count] of counts) {
        const node = this.nodes.get(id)!;
        if (analysis === before) node.beforeLoc = count;
        else node.afterLoc = count;
      }
    }
    if (before) file.beforeRange = { startLine: before.loc ? 1 : 0, endLine: before.loc };
    if (after) file.afterRange = { startLine: after.loc ? 1 : 0, endLine: after.loc };
    if (this.mode === "changes") {
      const diff = changedLines(before?.text ?? "", after?.text ?? "");
      for (const line of diff.added) this.nodes.get(ownerId(after!.owners[line]))!.added++;
      for (const line of diff.removed) this.nodes.get(ownerId(before!.owners[line]))!.removed++;
      if (before?.text !== after?.text) this.changed.add(file.id);
      const unownedText = (analysis?: FileAnalysis) =>
        analysis?.text
          .split("\n")
          .filter((_, i) => analysis.owners[i] === null)
          .join("\n") ?? "";
      if (unownedText(before) !== unownedText(after)) ownChanged.add(file.id);
      for (const [key] of scopes) {
        const oldScope = oldScopes.get(key);
        const newScope = newScopes.get(key);
        if (
          !oldScope ||
          !newScope ||
          oldScope.ownText !== newScope.ownText ||
          oldScope.jsDoc !== newScope.jsDoc
        ) {
          this.changed.add(ownerId(key));
          ownChanged.add(ownerId(key));
        }
      }
    }
    // Preserve own-code contributions as leaf regions, never sum inclusive parent LOC twice.
    for (const id of [file.id, ...[...scopes.keys()].map((key) => `scope:${path}#${key}`)]) {
      const node = this.nodes.get(id)!;
      if (!node.children.length) continue;
      if (node.beforeLoc || node.afterLoc || node.added || node.removed) {
        const own = this.add(makeNode(`residual:${id}`, id, "residual", "기타 코드", path));
        for (const metric of ["beforeLoc", "afterLoc", "added", "removed"] as const) {
          own[metric] = node[metric];
          node[metric] = 0;
        }
        if (ownChanged.has(id)) this.changed.add(own.id);
      }
    }
    // Existence is independent of LOC, including empty files and zero-owned-line scopes.
    if (!before && after && this.mode === "changes") file.status = "added";
    if (before && !after && this.mode === "changes") file.status = "deleted";
    for (const key of scopes.keys()) {
      const node = this.nodes.get(ownerId(key))!;
      if (!node.beforeRange && node.afterRange && this.mode === "changes") node.status = "added";
      if (node.beforeRange && !node.afterRange && this.mode === "changes") node.status = "deleted";
    }
  }

  finish(): ReportNode[] {
    const visit = (id: string): ReportNode => {
      const node = this.nodes.get(id)!;
      for (const childId of node.children) {
        const child = visit(childId);
        node.beforeLoc += child.beforeLoc;
        node.afterLoc += child.afterLoc;
        node.added += child.added;
        node.removed += child.removed;
        node.weight += child.weight;
        if (child.status !== "unchanged") this.changed.add(id);
      }
      node.delta = this.mode === "changes" ? node.afterLoc - node.beforeLoc : 0;
      if (!node.children.length)
        node.weight =
          this.mode === "changes" ? Math.max(node.beforeLoc, node.afterLoc) : node.afterLoc;
      if (this.mode === "changes" && node.status === "unchanged") {
        if (
          node.kind === "folder" &&
          node.children.every((id) => this.nodes.get(id)!.status === "added")
        )
          node.status = "added";
        else if (
          node.kind === "folder" &&
          node.children.every((id) => this.nodes.get(id)!.status === "deleted")
        )
          node.status = "deleted";
        else if (node.kind === "residual" && node.beforeLoc === 0 && node.afterLoc > 0)
          node.status = "added";
        else if (node.kind === "residual" && node.beforeLoc > 0 && node.afterLoc === 0)
          node.status = "deleted";
        else if (this.changed.has(id) || node.delta || node.added || node.removed)
          node.status = "modified";
      }
      node.children.sort(
        (a, b) =>
          this.nodes.get(a)!.path.localeCompare(this.nodes.get(b)!.path) ||
          this.nodes.get(a)!.name.localeCompare(this.nodes.get(b)!.name),
      );
      return node;
    };
    visit("project:root");
    return [...this.nodes.values()];
  }
}
