import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analysis";
import { git, inspectGit } from "../src/analysis/git";
import { generatedExclusions } from "../src/analysis/generated";

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "mutrix-generated-"));
  await git(root, ["init", "-b", "master"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "Mutrix fixture"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  return root;
}

test("Git resolves generated macros, nested overrides, false/unset and unusual filenames", async () => {
  const root = await repo();
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, ".gitattributes"),
      [
        "[attr]codegen linguist-generated",
        "src/** codegen",
        "src/false.ts linguist-generated=false",
        "src/unset.ts -linguist-generated",
        "src/reset.ts !linguist-generated",
        "src/true.ts linguist-generated=true",
      ].join("\n"),
    );
    await writeFile(join(root, "src", ".gitattributes"), "keep.ts -linguist-generated\n");
    for (const name of [
      "gen.ts",
      "한글 space.ts",
      "true.ts",
      "false.ts",
      "unset.ts",
      "reset.ts",
      "keep.ts",
    ])
      await writeFile(join(root, "src", name), "export function run(): number { return 1; }\n");
    const report = await analyze({ path: root });
    expect(report.meta.generatedExclusions!.map((entry) => entry.path)).toEqual(
      ["src/.gitattributes", "src/gen.ts", "src/true.ts", "src/한글 space.ts"].sort(),
    );
    for (const name of ["false", "unset", "reset", "keep"])
      expect(report.nodes.some((node) => node.id === `file:src/${name}.ts`)).toBe(true);
    expect(report.nodes.some((node) => node.path === "src/gen.ts")).toBe(false);
    expect(
      report.meta.generatedExclusions!.every((entry) => entry.snapshots.join() === "current"),
    ).toBe(true);
    const included = await analyze({ path: root, includeGenerated: true, exclude: ["src/gen.ts"] });
    expect(included.meta.generatedExclusions).toEqual([]);
    expect(included.nodes.some((node) => node.path === "src/gen.ts")).toBe(false);
    expect(included.nodes.some((node) => node.id === "file:src/true.ts")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("baseline/current union removes generated additions, deletions and reclassifications from all metrics", async () => {
  const root = await repo();
  try {
    await mkdir(join(root, "old"));
    await mkdir(join(root, "new"));
    await writeFile(
      join(root, ".gitattributes"),
      "old/** linguist-generated\nold/keep.ts -linguist-generated\n",
    );
    await writeFile(join(root, "old", "gen.ts"), "function generated() {\nreturn 1;\n}\n");
    await writeFile(join(root, "old", "keep.ts"), "export const keep = 1;\n");
    await writeFile(join(root, "new", "gen.ts"), "function other() {\n}\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    await git(root, ["checkout", "-b", "feature"]);
    await rm(join(root, "old", "gen.ts"));
    await writeFile(join(root, ".gitattributes"), "new/** linguist-generated\n");
    await writeFile(join(root, "new", "untracked.ts"), "function fresh() {}\n");
    await writeFile(join(root, "plain.ts"), "export const plain = 1;\n");
    const beforeStatus = await git(root, ["status", "--porcelain=v1", "-z"]);
    const beforeIndex = await git(root, ["ls-files", "--stage", "-z"]);
    const report = await analyze({ path: root });
    expect(report.meta.mode).toBe("changes");
    expect(report.meta.generatedExclusions).toEqual([
      { path: "new/gen.ts", attribute: "linguist-generated", snapshots: ["current"] },
      { path: "new/untracked.ts", attribute: "linguist-generated", snapshots: ["current"] },
      { path: "old/gen.ts", attribute: "linguist-generated", snapshots: ["baseline"] },
    ]);
    expect(report.meta.files).toBe(3);
    expect(report.nodes[0].beforeLoc).toBe(3);
    expect(report.nodes[0].afterLoc).toBe(3);
    expect(report.nodes.some((node) => node.id === "folder:new")).toBe(false);
    expect(report.nodes.find((node) => node.id === "folder:old")!.beforeLoc).toBe(1);
    const included = await analyze({ path: root, includeGenerated: true });
    expect(included.nodes.find((node) => node.id === "file:old/gen.ts")!.status).toBe("deleted");
    expect(included.nodes.find((node) => node.id === "file:new/untracked.ts")!.status).toBe(
      "added",
    );
    expect(await git(root, ["status", "--porcelain=v1", "-z"])).toBe(beforeStatus);
    expect(await git(root, ["ls-files", "--stage", "-z"])).toBe(beforeIndex);
    expect(await readFile(join(root, ".gitattributes"), "utf8")).toBe(
      "new/** linguist-generated\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-Git folders retain files; attribute lookup failures explain the explicit bypass", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-no-git-"));
  try {
    await writeFile(join(root, ".gitattributes"), "*.ts linguist-generated\n");
    await writeFile(join(root, "generated.ts"), "const value = 1;\n");
    const report = await analyze({ path: root });
    expect(report.meta.generatedExclusions).toEqual([]);
    expect(report.nodes.some((node) => node.id === "file:generated.ts")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const gitRoot = await repo();
  try {
    await writeFile(join(gitRoot, "a.txt"), "a\n");
    const context = await inspectGit(gitRoot);
    await expect(
      generatedExclusions({ ...context, mode: "changes", baseCommit: "invalid" }, ["a.txt"]),
    ).rejects.toThrow("--include-generated");
    expect(await generatedExclusions(context, [])).toEqual([]);
  } finally {
    await rm(gitRoot, { recursive: true, force: true });
  }
});
