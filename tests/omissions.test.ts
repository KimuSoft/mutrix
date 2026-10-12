import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analysis";
import { git } from "../src/analysis/git";

test("output and Summary omissions work with Git's canonical Windows paths on both snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-omit-"));
  try {
    await git(root, ["init", "-b", "master"]);
    await git(root, ["config", "user.name", "Mutrix fixture"]);
    await git(root, ["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(root, "a.ts"), "const a = 1;\n");
    await writeFile(join(root, "report.html"), "<html>old report</html>\n");
    await writeFile(join(root, "summary.json"), "{}\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    await git(root, ["checkout", "-b", "feature"]);
    await writeFile(join(root, "a.ts"), "const a = 2;\n");
    const report = await analyze({
      path: root,
      omit: [
        join(root, "report.html"),
        join(root, "summary.json"),
        join(root, "new", "output.json"),
      ],
    });
    expect(report.meta.files).toBe(1);
    expect(report.nodes[0].beforeLoc).toBe(1);
    expect(report.nodes[0].afterLoc).toBe(1);
    expect(report.nodes.filter((node) => node.kind === "file").map((node) => node.path)).toEqual([
      "a.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
