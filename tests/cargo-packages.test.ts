import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analysis";
import { packageInfo } from "../src/analysis/packages";
import { git } from "../src/analysis/git";
import type { Diagnostic } from "../src/shared/types";

test("Cargo detection parses actual TOML and distinguishes virtual workspaces and invalid packages", () => {
  const diagnostics: Diagnostic[] = [];
  const manifest = `[package]\nname = 'project-engine' # comment\nversion.workspace = true\n[workspace]\nmembers = [\n 'nested',\n]\n`;
  expect(packageInfo("Cargo.toml", undefined, manifest, diagnostics)).toEqual({
    after: { name: "project-engine", kind: "cargo" },
  });
  expect(
    packageInfo(
      "Cargo.toml",
      undefined,
      '[workspace]\n[workspace.package]\nname = "not-a-crate"\n',
      diagnostics,
    ),
  ).toBeUndefined();
  expect(diagnostics).toEqual([]);
  for (const text of [
    "[package]\nname = ",
    '[package]\nversion = "1.0.0"',
    "[package]\nname = 12",
    '[package]\nname = " "',
  ])
    expect(packageInfo("Cargo.toml", undefined, text, diagnostics)).toBeUndefined();
  expect(diagnostics.length).toBe(4);
  expect(diagnostics.every((item) => item.level === "warning")).toBe(true);
});

test("Cargo precedence is per snapshot and independent of manifest enumeration order", () => {
  const cargo = '[package]\nname = "crate-one"\n';
  const js = '{"name":"js-tooling"}';
  const firstCargo = packageInfo("Cargo.toml", cargo, undefined, []);
  const firstJs = packageInfo("package.json", js, js, []);
  const expected = {
    before: { name: "crate-one", kind: "cargo" as const },
    after: { name: "js-tooling" },
  };
  expect(packageInfo("package.json", js, js, [], firstCargo)).toEqual(expected);
  expect(packageInfo("Cargo.toml", cargo, undefined, [], firstJs)).toEqual(expected);
});

test("crate snapshots, deleted manifests, invalid files and exclusions preserve LOC and repository state", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-cargo-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.email", "fixture@example.invalid"]);
    await git(root, ["config", "user.name", "Mutrix fixture"]);
    for (const folder of ["crates/engine", "crates/gone", "crates/bad"])
      await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, "Cargo.toml"), '[workspace]\nmembers = ["crates/*"]\n');
    await writeFile(
      join(root, "crates/engine/Cargo.toml"),
      '[package]\nname = "engine"\nversion.workspace = true\n',
    );
    await writeFile(join(root, "crates/engine/package.json"), '{"private":true}');
    await writeFile(join(root, "crates/engine/lib.rs"), "pub fn run() {}\n");
    await writeFile(join(root, "crates/gone/Cargo.toml"), '[package]\nname = "gone"\n');
    await writeFile(join(root, "crates/bad/Cargo.toml"), "[package]\nname = ");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);
    const structure = await analyze({ path: root });
    expect(structure.nodes[0].package).toBeUndefined();
    expect(
      structure.nodes.find((node) => node.id === "folder:crates/engine")?.package?.after,
    ).toEqual({ name: "engine", kind: "cargo" });
    expect(
      structure.nodes.find((node) => node.id === "folder:crates/bad")?.package,
    ).toBeUndefined();
    expect(structure.nodes.find((node) => node.id === "file:crates/bad/Cargo.toml")?.afterLoc).toBe(
      2,
    );
    await git(root, ["switch", "-c", "feature"]);
    await writeFile(
      join(root, "crates/engine/Cargo.toml"),
      '[package]\nname = "renamed"\nversion.workspace = true\n',
    );
    await rm(join(root, "crates/gone/Cargo.toml"));
    const before = await git(root, ["status", "--porcelain=v1", "-z"]);
    const report = await analyze({ path: root });
    expect(report.nodes.find((node) => node.id === "folder:crates/engine")?.package).toEqual({
      before: { name: "engine", kind: "cargo" },
      after: { name: "renamed", kind: "cargo" },
    });
    expect(report.nodes.find((node) => node.id === "folder:crates/gone")?.package).toEqual({
      before: { name: "gone", kind: "cargo" },
    });
    expect(
      report.nodes
        .filter((node) => !node.children.length)
        .reduce((sum, node) => sum + node.afterLoc, 0),
    ).toBe(report.nodes[0].afterLoc);
    const excluded = await analyze({ path: root, exclude: ["**/Cargo.toml"] });
    expect(
      excluded.nodes.every(
        (node) => node.package?.before?.kind !== "cargo" && node.package?.after?.kind !== "cargo",
      ),
    ).toBe(true);
    expect(
      excluded.nodes.find((node) => node.id === "folder:crates/engine")?.package?.after,
    ).toEqual({});
    expect(await git(root, ["status", "--porcelain=v1", "-z"])).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
