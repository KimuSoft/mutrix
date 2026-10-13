import { basename, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { inspectGit, currentPaths, baselineFiles, renames } from "./git";
import { GitObjects } from "./git-objects";
import {
  DEFAULT_EXCLUDES,
  decodeText,
  fileFilter,
  readCurrent,
  walkFiles,
  canonicalPath,
} from "./files";
import { analyzeFile } from "./scopes";
import { ReportTree } from "./tree";
import { packageInfo } from "./packages";
import { generatedExclusions } from "./generated";
import type { AnalyzeOptions, Report } from "../shared/types";

export async function analyze(options: AnalyzeOptions): Promise<Report> {
  const requested = resolve(options.path);
  if (!(await stat(requested)).isDirectory())
    throw new Error(`Expected a project directory: ${requested}`);
  const context = await inspectGit(requested, options.base);
  context.root = await canonicalPath(context.root);
  const excluded = [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])];
  const omitted = await Promise.all((options.omit ?? []).map(canonicalPath));
  const include = fileFilter(context.root, excluded, omitted);
  const paths =
    (await currentPaths(context)) ?? (await walkFiles(context.root, include, context.diagnostics));
  const baseline = await baselineFiles(context);
  const candidates = [...new Set([...paths, ...baseline.keys()])].filter(include).sort();
  const generated = options.includeGenerated ? [] : await generatedExclusions(context, candidates);
  const generatedPaths = new Set(generated.map((entry) => entry.path));
  const allPaths = candidates.filter((path) => !generatedPaths.has(path));
  if (generated.length)
    context.diagnostics.push({
      level: "info",
      message: `${generated.length} paths excluded by linguist-generated attributes (baseline/current union). Use --include-generated to include them.`,
    });
  const tree = new ReportTree(context.mode, basename(context.root));
  let files = 0;
  const objects = baseline.size ? new GitObjects(context.root) : undefined;
  try {
    for (const path of allPaths) {
      const afterText = await readCurrent(context.root, path, context.diagnostics);
      const sha = baseline.get(path);
      let beforeText: string | undefined;
      if (sha) {
        beforeText = decodeText(await objects!.read(sha));
        if (beforeText === undefined)
          context.diagnostics.push({
            level: "info",
            path,
            message: "Baseline binary or non-UTF-8 file excluded.",
          });
      }
      if (beforeText === undefined && afterText === undefined) continue;
      const before = beforeText === undefined ? undefined : analyzeFile(path, beforeText);
      const after = afterText === undefined ? undefined : analyzeFile(path, afterText);
      context.diagnostics.push(...(before?.diagnostics ?? []), ...(after?.diagnostics ?? []));
      tree.addFile(path, before, after);
      if (path.split("/").at(-1) === "package.json") {
        const parentId = tree.nodes.get(`file:${path}`)!.parentId!;
        tree.nodes.get(parentId)!.package = packageInfo(
          path,
          beforeText,
          afterText,
          context.diagnostics,
        );
      }
      files++;
    }
    await objects?.close();
  } catch (error) {
    await objects?.abort();
    throw error;
  }
  for (const [oldPath, newPath] of await renames(context)) {
    const oldNode = tree.nodes.get(`file:${oldPath}`);
    const newNode = tree.nodes.get(`file:${newPath}`);
    if (oldNode && newNode) {
      oldNode.rename = { path: newPath, nodeId: newNode.id };
      newNode.rename = { path: oldPath, nodeId: oldNode.id };
    }
  }
  return {
    schemaVersion: 1,
    meta: {
      name: basename(context.root),
      rootPath: context.root,
      generatedAt: new Date().toISOString(),
      mode: context.mode,
      branch: context.branch,
      headCommit: context.headCommit,
      baseRef: context.baseRef,
      baseCommit: context.baseCommit,
      excluded,
      files,
      generatedExclusions: generated,
    },
    rootId: "project:root",
    nodes: tree.finish(),
    diagnostics: context.diagnostics,
  };
}
