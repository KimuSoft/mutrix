import { Node, Project, ScriptKind, type SourceFile } from "ts-morph";
import { physicalLines } from "./lines";
import type { Diagnostic, SourceRange } from "../shared/types";

export interface ScopeInfo {
  key: string;
  parent: string | null;
  name: string;
  kind: string;
  range: SourceRange;
  start: number;
  end: number;
  ownLoc: number;
  ownText: string;
  jsDoc?: string;
}
export interface FileAnalysis {
  text: string;
  loc: number;
  scopes: ScopeInfo[];
  owners: (string | null)[];
  diagnostics: Diagnostic[];
}

function scopeKind(node: Node): string | null {
  if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) return "class";
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node)) return "function";
  if (Node.isArrowFunction(node)) return "arrow";
  if (Node.isMethodDeclaration(node)) return "method";
  if (Node.isConstructorDeclaration(node)) return "constructor";
  if (Node.isGetAccessorDeclaration(node)) return "get";
  if (Node.isSetAccessorDeclaration(node)) return "set";
  return null;
}

function scopeName(node: Node): string {
  if (Node.isConstructorDeclaration(node)) return "constructor";
  if ("getName" in node && typeof node.getName === "function") {
    const name = node.getName();
    if (typeof name === "string" && name) return name;
  }
  const parent = node.getParent();
  if (
    parent &&
    (Node.isVariableDeclaration(parent) ||
      Node.isPropertyAssignment(parent) ||
      Node.isPropertyDeclaration(parent))
  ) {
    return parent.getName();
  }
  if (parent && Node.isCallExpression(parent)) {
    return `${parent.getExpression().getText().slice(0, 60)} callback`;
  }
  return "anonymous";
}

const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

/** Read attached JSDoc only; a containing function's docs never belong to its callbacks. */
function scopeDocumentation(node: Node): string | undefined {
  const read = (owner: Node) => {
    const docs = Node.isJSDocable(owner)
      ? owner.getJsDocs().map((doc) => doc.getInnerText())
      : owner
          .getLeadingCommentRanges()
          .map((comment) => comment.getText())
          .filter((text) => text.startsWith("/**"))
          .map((text) =>
            text
              .slice(3, -2)
              .split(/\r?\n/)
              .map((line) => line.replace(/^\s*\* ?/, ""))
              .join("\n"),
          );
    return (
      docs
        .map((doc) => doc.trim())
        .filter(Boolean)
        .join("\n\n") || undefined
    );
  };
  const direct = read(node);
  if (direct) return direct;
  let owner = node;
  const parent = node.getParent();
  if (
    parent &&
    (Node.isPropertyDeclaration(parent) ||
      Node.isPropertyAssignment(parent) ||
      Node.isVariableDeclaration(parent))
  ) {
    owner = parent;
    if (Node.isVariableDeclaration(parent)) {
      const statement = parent.getVariableStatement();
      if (statement?.getDeclarations().length === 1) owner = statement;
    }
  }
  return owner === node ? undefined : read(owner);
}

export function analyzeFile(path: string, text: string): FileAnalysis {
  const lines = physicalLines(text);
  const result: FileAnalysis = {
    text,
    loc: lines.length,
    scopes: [],
    owners: Array(lines.length).fill(null),
    diagnostics: [],
  };
  if (!sourceExtensions.test(path) || !text) return result;
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { noLib: true, allowJs: true },
  });
  let source: SourceFile | undefined;
  try {
    source = project.createSourceFile(path, text, {
      scriptKind: /x$/i.test(path)
        ? ScriptKind.TSX
        : /\.[cm]?js$/i.test(path)
          ? ScriptKind.JS
          : ScriptKind.TS,
    });
    // Syntax diagnostics only: no type checking or dependency traversal is needed.
    const syntaxErrors = project
      .getProgram()
      .compilerObject.getSyntacticDiagnostics(source.compilerNode);
    if (syntaxErrors.length) {
      result.diagnostics.push({
        level: "warning",
        path,
        message: "Syntax error: scopes unavailable; file LOC is retained.",
      });
      return result;
    }
    const counts = new Map<string, number>();
    const walk = (node: Node, parent: string | null, depth: number) => {
      let nextParent = parent;
      let nextDepth = depth;
      const kind = scopeKind(node);
      if (kind) {
        const name = scopeName(node);
        const stem = `${parent ? `${parent}/` : ""}${kind}:${encodeURIComponent(name)}`;
        const ordinal = (counts.get(stem) ?? 0) + 1;
        counts.set(stem, ordinal);
        const key = `${stem}~${ordinal}`;
        const start = node.getStart();
        const end = node.getEnd();
        const startLine = source!.getLineAndColumnAtPos(start).line;
        const endLine = source!.getLineAndColumnAtPos(Math.max(start, end - 1)).line;
        result.scopes.push({
          key,
          parent,
          name,
          kind,
          start,
          end,
          range: { startLine, endLine },
          ownLoc: 0,
          ownText: "",
          jsDoc: scopeDocumentation(node),
        });
        // Preorder traversal ensures earlier source positions win equal-depth ties.
        for (let line = startLine - 1; line < Math.min(endLine, lines.length); line++) {
          const previous = ownershipDepth[line] ?? -1;
          if (depth > previous) {
            result.owners[line] = key;
            ownershipDepth[line] = depth;
          }
        }
        nextParent = key;
        nextDepth = depth + 1;
      }
      node.forEachChild((child) => {
        walk(child, nextParent, nextDepth);
      });
    };
    const ownershipDepth: number[] = [];
    walk(source, null, 0);
    const owned = new Map<string, string[]>();
    for (let line = 0; line < lines.length; line++) {
      const key = result.owners[line];
      if (key) {
        const list = owned.get(key) ?? [];
        list.push(lines[line]);
        owned.set(key, list);
      }
    }
    for (const scope of result.scopes) {
      const own = owned.get(scope.key) ?? [];
      scope.ownLoc = own.length;
      scope.ownText = own.join("\n");
    }
    return result;
  } finally {
    if (source) project.removeSourceFile(source);
  }
}
