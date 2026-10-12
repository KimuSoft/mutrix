import { resolve } from "node:path";
import type { Diagnostic } from "../shared/types";

export async function git(
  cwd: string,
  args: string[],
  optional = false,
): Promise<string | undefined> {
  try {
    const child = Bun.spawn(["git", "-C", cwd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exit !== 0) {
      if (optional) return undefined;
      throw new Error(err.trim() || `git ${args[0]} failed`);
    }
    return out;
  } catch (error) {
    if (optional) return undefined;
    throw error;
  }
}

export interface GitContext {
  root: string;
  isGit: boolean;
  branch?: string;
  headCommit?: string;
  baseRef?: string;
  baseCommit?: string;
  mode: "structure" | "changes";
  diagnostics: Diagnostic[];
}

export async function inspectGit(path: string, base?: string): Promise<GitContext> {
  const gitRoot = await git(path, ["rev-parse", "--show-toplevel"], true);
  const context: GitContext = {
    root: resolve(gitRoot?.trim() ?? path),
    isGit: !!gitRoot,
    mode: "structure",
    diagnostics: [],
  };
  if (!context.isGit) {
    if (base) throw new Error("--base requires a Git repository with an existing reference.");
    context.diagnostics.push({
      level: "info",
      message: Bun.which("git")
        ? "No Git repository found. Showing the current folder structure."
        : "Git is not installed or not on PATH. Showing folder structure; Git ignore rules are unavailable.",
    });
    return context;
  }
  context.branch =
    (await git(context.root, ["symbolic-ref", "--short", "HEAD"], true))?.trim() ?? "detached HEAD";
  context.headCommit = (await git(context.root, ["rev-parse", "--verify", "HEAD"], true))?.trim();
  const candidates = base
    ? [base]
    : [
        "refs/heads/master",
        "refs/heads/main",
        "refs/remotes/origin/master",
        "refs/remotes/origin/main",
      ];
  let baseSha: string | undefined;
  for (const ref of candidates) {
    baseSha = (
      await git(
        context.root,
        ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
        true,
      )
    )?.trim();
    if (baseSha) {
      context.baseRef = ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "");
      break;
    }
  }
  if (!baseSha) {
    if (base) throw new Error(`Invalid base reference: ${base}`);
    context.diagnostics.push({
      level: "info",
      message:
        "No master/main reference found. Showing current structure; use --base to select a reference.",
    });
    return context;
  }
  if (!context.headCommit) {
    if (base) throw new Error("Cannot find a merge-base: this repository has no HEAD commit.");
    context.diagnostics.push({
      level: "info",
      message: "No HEAD commit. Showing current structure.",
    });
    return context;
  }
  const comparisonBranch = context.baseRef!.replace(/^origin\//, "");
  if (context.branch === comparisonBranch) {
    context.baseCommit = baseSha;
    return context;
  }
  const mergeBase = (
    await git(context.root, ["merge-base", baseSha, context.headCommit], true)
  )?.trim();
  if (!mergeBase) throw new Error(`No common ancestor between ${context.baseRef} and HEAD.`);
  context.baseCommit = mergeBase;
  context.mode = "changes";
  return context;
}

export async function currentPaths(context: GitContext): Promise<string[] | undefined> {
  if (!context.isGit) return undefined;
  const output = await git(context.root, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return [...new Set(output!.split("\0").filter(Boolean))];
}

export async function baselineFiles(context: GitContext): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  if (context.mode !== "changes" || !context.baseCommit) return files;
  const output = await git(context.root, ["ls-tree", "-r", "-z", context.baseCommit]);
  for (const record of output!.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const [mode, kind, sha] = record.slice(0, tab).split(" ");
    if (kind === "blob" && mode !== "120000") files.set(record.slice(tab + 1), sha);
  }
  return files;
}

export async function renames(context: GitContext): Promise<[string, string][]> {
  if (context.mode !== "changes") return [];
  const output = await git(context.root, [
    "diff",
    "--no-ext-diff",
    "--name-status",
    "--find-renames",
    "-z",
    context.baseCommit!,
    "--",
  ]);
  const parts = output!.split("\0");
  const pairs: [string, string][] = [];
  for (let i = 0; i < parts.length && parts[i];) {
    const status = parts[i++];
    const from = parts[i++];
    if (status.startsWith("R") || status.startsWith("C")) {
      const to = parts[i++];
      if (status.startsWith("R")) pairs.push([from, to]);
    }
  }
  return pairs;
}
