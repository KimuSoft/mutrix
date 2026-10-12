import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analysis";
import { git } from "../src/analysis/git";

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "mutrix-test-"));
  await git(root, ["init", "-b", "master"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "Mutrix fixture"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  return root;
}

test("base structure and merge-base → working folder includes all final changes", async () => {
  const root = await repo();
  try {
    await writeFile(join(root, "a.ts"), "function a() { return 1; }\n");
    await writeFile(join(root, "gone.txt"), "one\ntwo\n");
    await writeFile(join(root, ".gitignore"), "ignored.txt\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    const base = await analyze({ path: root });
    expect(base.meta.mode).toBe("structure");
    expect(base.nodes[0].beforeLoc).toBe(0);
    expect(base.nodes[0].afterLoc).toBe(4);
    const baseCommit = (await git(root, ["rev-parse", "HEAD"]))!.trim();
    await git(root, ["checkout", "-b", "feature"]);
    await writeFile(join(root, "a.ts"), "function a() {\n return 2;\n}\n");
    await git(root, ["add", "a.ts"]);
    await git(root, ["commit", "-m", "feature"]);
    await git(root, ["checkout", "master"]);
    await writeFile(join(root, "master-only.txt"), "should not appear in baseline\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "base advanced"]);
    await git(root, ["checkout", "feature"]);
    await writeFile(join(root, "a.ts"), "function a() {\n return 3;\n}\n");
    await git(root, ["add", "a.ts"]);
    await writeFile(join(root, "a.ts"), "function a() {\n return 4;\n}\n// working\n");
    await writeFile(join(root, "new.ts"), "const added = () => true;\n");
    await writeFile(join(root, "ignored.txt"), "ignored\n");
    await rm(join(root, "gone.txt"));
    const statusBefore = await git(root, ["status", "--porcelain=v1", "-z"]);
    const contentBefore = await readFile(join(root, "a.ts"), "utf8");
    const report = await analyze({ path: root });
    expect(report.meta.mode).toBe("changes");
    expect(report.meta.baseCommit).toBe(baseCommit);
    expect(report.nodes.find((n) => n.id === "file:a.ts")!.afterLoc).toBe(4);
    expect(report.nodes.find((n) => n.id === "file:new.ts")!.status).toBe("added");
    expect(report.nodes.find((n) => n.id === "file:gone.txt")!.status).toBe("deleted");
    expect(report.nodes.some((n) => n.path === "ignored.txt" || n.path === "master-only.txt")).toBe(
      false,
    );
    expect(report.nodes[0].beforeLoc).toBe(4);
    expect(report.nodes[0].afterLoc).toBe(6);
    expect(await git(root, ["status", "--porcelain=v1", "-z"])).toBe(statusBefore);
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe(contentBefore);
    await expect(analyze({ path: root, base: "missing" })).rejects.toThrow("Invalid base");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rename links preserve old and new folder membership", async () => {
  const root = await repo();
  try {
    await mkdir(join(root, "old"));
    await mkdir(join(root, "new"));
    await writeFile(
      join(root, "old", "name with space.ts"),
      "export const a = () => 1;\nexport const b = () => 2;\n",
    );
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    await git(root, ["checkout", "-b", "move"]);
    await git(root, ["mv", "old/name with space.ts", "new/name with space.ts"]);
    const report = await analyze({ path: root });
    expect(report.nodes.find((n) => n.id === "file:old/name with space.ts")!.rename?.path).toBe(
      "new/name with space.ts",
    );
    expect(report.nodes.find((n) => n.id === "folder:old")!.delta).toBe(-2);
    expect(report.nodes.find((n) => n.id === "folder:new")!.delta).toBe(2);
    expect(report.nodes[0].delta).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-git folder excludes generated folders, outputs and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-folder-"));
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "src", "a.ts"), "const a = 1;\n");
    await writeFile(join(root, "node_modules", "a.js"), "should be excluded\n");
    await writeFile(join(root, "report.html"), "excluded\n");
    const report = await analyze({ path: join(root), omit: [join(root, "report.html")] });
    expect(report.meta.mode).toBe("structure");
    expect(report.meta.files).toBe(1);
    expect(report.nodes[0].afterLoc).toBe(1);
    await expect(analyze({ path: root, base: "master" })).rejects.toThrow("requires a Git");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unrelated branches fail without changing the repository", async () => {
  const root = await repo();
  try {
    await writeFile(join(root, "a.txt"), "a\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "base"]);
    await git(root, ["checkout", "--orphan", "unrelated"]);
    await git(root, ["commit", "-m", "unrelated"]);
    await expect(analyze({ path: root, base: "master" })).rejects.toThrow("No common ancestor");
    expect((await git(root, ["branch", "--show-current"]))!.trim()).toBe("unrelated");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
