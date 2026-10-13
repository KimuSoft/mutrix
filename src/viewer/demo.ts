import type { Report, ReportNode } from "../shared/types";

/** Metadata-only fixture for development and the distributable example report. */
export function demoReport(): Report {
  const nodes: ReportNode[] = [];
  const map = new Map<string, ReportNode>();
  function add(
    id: string,
    parentId: string | null,
    kind: ReportNode["kind"],
    name: string,
    path: string,
    before = 0,
    after = 0,
  ) {
    const delta = after - before;
    const node: ReportNode = {
      id,
      parentId,
      kind,
      name,
      path,
      beforeLoc: before,
      afterLoc: after,
      delta,
      added: Math.max(0, delta),
      removed: Math.max(0, -delta),
      status:
        !before && after
          ? "added"
          : before && !after
            ? "deleted"
            : delta
              ? "modified"
              : "unchanged",
      weight: Math.max(before, after),
      children: [],
    };
    nodes.push(node);
    map.set(id, node);
    if (parentId) map.get(parentId)!.children.push(id);
    return node;
  }
  add("project:root", null, "project", "atlas", "").package = {
    before: { name: "atlas" },
    after: { name: "atlas" },
  };
  const files: [string, number, number, string[]][] = [
    ["src/editor/commands.ts", 412, 588, ["createCommand", "dispatch", "resolveSelection"]],
    ["src/editor/document.ts", 680, 452, ["Document", "applyTransaction", "normalize"]],
    ["src/editor/history.ts", 224, 224, ["History", "undo", "redo"]],
    ["src/editor/selection.ts", 0, 286, ["Selection", "mapRange", "mergeRanges"]],
    ["src/editor/legacy.ts", 310, 0, ["LegacyAdapter", "convert"]],
    ["src/plugins/markdown/parser.ts", 540, 710, ["parseMarkdown", "parseBlock", "parseInline"]],
    ["src/plugins/markdown/serializer.ts", 384, 392, ["serialize", "escapeText"]],
    ["src/plugins/tables/model.ts", 416, 416, ["TableModel", "insertRow", "removeColumn"]],
    ["src/plugins/tables/commands.ts", 258, 193, ["resizeTable", "mergeCells"]],
    ["src/plugins/links/handler.ts", 182, 215, ["handleLink", "resolveUrl"]],
    ["src/ui/Editor.tsx", 362, 268, ["Editor", "useEditorState"]],
    ["src/ui/Toolbar.tsx", 214, 240, ["Toolbar", "ToolbarItem"]],
    ["src/ui/Outline.tsx", 0, 178, ["Outline", "OutlineItem"]],
    ["src/ui/styles.css", 196, 204, []],
    ["src/utils/range.ts", 142, 142, ["clamp", "intersect", "contains"]],
    ["src/utils/events.ts", 96, 96, ["EventEmitter", "subscribe"]],
    ["tests/editor.test.ts", 312, 460, ["testDocument", "testHistory", "testSelection"]],
    ["tests/parser.test.ts", 186, 292, ["testBlock", "testInline"]],
    ["package.json", 48, 52, []],
    ["README.md", 120, 132, []],
    ["tsconfig.json", 24, 24, []],
  ];
  for (const [path, before, after, names] of files) {
    const parts = path.split("/");
    let parent = "project:root";
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts.slice(0, i + 1).join("/");
      const id = `folder:${folder}`;
      if (!map.has(id)) add(id, parent, "folder", parts[i], folder);
      parent = id;
    }
    const file = add(
      `file:${path}`,
      parent,
      "file",
      parts.at(-1)!,
      path,
      names.length ? 0 : before,
      names.length ? 0 : after,
    );
    if (names.length) {
      let oldStart = 1,
        newStart = 1;
      names.forEach((name, i) => {
        const b = Math.floor(before / names.length) + (i === 0 ? before % names.length : 0);
        const a = Math.floor(after / names.length) + (i === 0 ? after % names.length : 0);
        const scope = add(`scope:${path}#function:${name}~1`, file.id, "scope", name, path, b, a);
        scope.symbolKind = /^[A-Z]/.test(name) ? "class" : "function";
        if (b) scope.beforeRange = { startLine: oldStart, endLine: oldStart + b - 1 };
        if (a) scope.afterRange = { startLine: newStart, endLine: newStart + a - 1 };
        oldStart += b;
        newStart += a;
      });
    }
  }
  const neutral = map.get("scope:src/editor/history.ts#function:undo~1")!;
  neutral.status = "modified";
  neutral.added = 18;
  neutral.removed = 18;
  neutral.summary =
    "Undo 경계를 명시적으로 분리했습니다. 전체 줄 수는 같지만 내부 처리 순서가 바뀌었습니다.";
  map.get("file:src/editor/document.ts")!.summary =
    "문서 정규화 처리를 작은 함수로 분리하고 중복 변환을 제거했습니다.";
  map.get("file:src/editor/selection.ts")!.summary =
    "선택 범위의 매핑과 병합을 독립 모듈로 추출했습니다.";
  for (const node of [...nodes].reverse()) {
    if (!node.children.length) continue;
    node.weight = 0;
    for (const id of node.children) {
      const child = map.get(id)!;
      node.beforeLoc += child.beforeLoc;
      node.afterLoc += child.afterLoc;
      node.added += child.added;
      node.removed += child.removed;
      node.weight += child.weight;
    }
    node.delta = node.afterLoc - node.beforeLoc;
    node.status =
      !node.beforeLoc && node.afterLoc
        ? "added"
        : node.beforeLoc && !node.afterLoc
          ? "deleted"
          : node.children.some((id) => map.get(id)!.status !== "unchanged")
            ? "modified"
            : "unchanged";
    node.children.sort((a, b) => map.get(a)!.name.localeCompare(map.get(b)!.name));
  }
  return {
    schemaVersion: 1,
    meta: {
      name: "atlas",
      rootPath: "C:\\projects\\atlas",
      generatedAt: "2026-10-12T09:30:00.000Z",
      mode: "changes",
      branch: "refactor/editor-core",
      baseRef: "main",
      baseCommit: "8f2c17a65d31e778bcd42560ab3b91ec04d782ff",
      excluded: [],
      files: files.length,
    },
    rootId: "project:root",
    nodes,
    diagnostics: [
      {
        level: "info",
        message:
          "Example report · synthetic metadata. Run mutrix.exe on your project to create a real snapshot.",
      },
    ],
  };
}
