import { readdir, lstat, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, basename, dirname } from "node:path";
import type { Diagnostic } from "../shared/types";

export const DEFAULT_EXCLUDES = [
  "**/.git/**",
  "**/node_modules/**",
  "**/vendor/**",
  "**/dist/**",
  "**/build/**",
  "**/target/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.cache/**",
  "**/artifacts/**",
  "**/.venv/**",
  "**/__pycache__/**",
  "**/bun.lock",
  "**/bun.lockb",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/Cargo.lock",
];

/** Canonicalize Windows 8.3/junction aliases even when a new output does not exist yet. */
export async function canonicalPath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      return join(await realpath(ancestor), ...suffix.reverse());
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

export function fileFilter(root: string, excludes: string[], omit: string[]) {
  const globs = excludes.map((pattern) => new Bun.Glob(pattern.replace(/\\/g, "/")));
  const omitted = new Set(omit.map((path) => resolve(path).toLowerCase()));
  return (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    if (omitted.has(resolve(root, path).toLowerCase())) return false;
    if (globs.some((glob) => glob.match(normalized) || glob.match(`${normalized}/`))) return false;
    return true;
  };
}

export async function walkFiles(
  root: string,
  include: (path: string) => boolean,
  diagnostics: Diagnostic[],
): Promise<string[]> {
  const paths: string[] = [];
  const walk = async (folder: string) => {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      diagnostics.push({
        level: "warning",
        path: relative(root, folder),
        message: `Cannot read directory: ${String(error)}`,
      });
      return;
    }
    for (const entry of entries) {
      const absolute = join(folder, entry.name);
      const path = relative(root, absolute).replace(/\\/g, "/");
      if (entry.isSymbolicLink() || !include(path)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) paths.push(path);
    }
  };
  await walk(root);
  return paths;
}

export function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export async function readCurrent(
  root: string,
  path: string,
  diagnostics: Diagnostic[],
): Promise<string | undefined> {
  try {
    const absolute = join(root, path);
    if (!(await lstat(absolute)).isFile()) return undefined;
    const text = decodeText(await readFile(absolute));
    if (text === undefined)
      diagnostics.push({ level: "info", path, message: "Binary or non-UTF-8 file excluded." });
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot read ${path}: ${String(error)}`);
  }
}
