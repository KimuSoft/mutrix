import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyze } from "../src/analysis";
import { git } from "../src/analysis/git";

test("package boundaries use included valid manifests from both Git snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-packages-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.email", "fixture@example.invalid"]);
    await git(root, ["config", "user.name", "Mutrix fixture"]);
    for (const path of [
      "packages/a",
      "packages/gone",
      "packages/bad",
      "packages/empty",
      "plain",
      "ignored",
    ])
      await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, "package.json"), '{"private":true,"workspaces":["packages/*"]}');
    await writeFile(join(root, "packages/a/package.json"), '{"name":"@demo/a"}');
    await writeFile(join(root, "packages/gone/package.json"), '{"name":"old"}');
    await writeFile(join(root, "packages/bad/package.json"), "[]");
    await writeFile(join(root, "packages/empty/package.json"), "{}");
    await writeFile(join(root, "plain/a.ts"), "export const a = 1;");
    await writeFile(join(root, "ignored/package.json"), "{}");
    await writeFile(join(root, ".gitignore"), "ignored/\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    const structure = await analyze({ path: root });
    expect(structure.nodes[0].package).toEqual({ after: {} });
    expect(structure.nodes.find((n) => n.id === "folder:packages/a")!.package?.after?.name).toBe(
      "@demo/a",
    );
    expect(structure.nodes.find((n) => n.id === "folder:plain")!.package).toBeUndefined();
    expect(structure.nodes.find((n) => n.id === "folder:packages/bad")!.package).toBeUndefined();
    expect(structure.diagnostics.some((d) => d.path === "packages/bad/package.json")).toBe(true);
    expect(structure.nodes.some((n) => n.path.startsWith("ignored"))).toBe(false);
    await git(root, ["switch", "-c", "feature"]);
    await rm(join(root, "packages/gone/package.json"));
    await writeFile(join(root, "packages/a/package.json"), '{"name":"@demo/renamed"}');
    await writeFile(join(root, "packages/bad/package.json"), "{broken");
    await mkdir(join(root, "packages/new"));
    await writeFile(join(root, "packages/new/package.json"), "{}");
    const report = await analyze({ path: root });
    expect(report.nodes.find((n) => n.id === "folder:packages/gone")!.package).toEqual({
      before: { name: "old" },
    });
    expect(report.nodes.find((n) => n.id === "folder:packages/a")!.package).toEqual({
      before: { name: "@demo/a" },
      after: { name: "@demo/renamed" },
    });
    expect(report.nodes.find((n) => n.id === "folder:packages/new")!.package).toEqual({
      after: {},
    });
    const excluded = await analyze({ path: root, exclude: ["**/package.json"] });
    expect(excluded.nodes.every((n) => !n.package)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
