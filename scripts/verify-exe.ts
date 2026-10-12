import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, delimiter } from "node:path";
import { analyze } from "../src/analysis";
import { git } from "../src/analysis/git";
import type { Report } from "../src/shared/types";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
if (process.platform !== "win32") throw new Error("Executable verification targets Windows x64.");
const executable = resolve("dist/mutrix.exe");
const systemPath = `${process.env.SystemRoot}\\System32`;
const gitPath = Bun.which("git");
assert(gitPath, "Git is required for this verification.");
const gitDirectory = gitPath.slice(0, gitPath.lastIndexOf("\\"));
const fixture = await mkdtemp(join(tmpdir(), "mutrix-exe-"));
async function run(args: string[], withGit = true) {
  const child = Bun.spawn([executable, fixture, ...args], {
    cwd: fixture,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PATH: withGit ? `${gitDirectory}${delimiter}${systemPath}` : systemPath,
    },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, code };
}
try {
  await writeFile(join(fixture, "source.ts"), "export function compute() {\n return 1;\n}\n");
  await writeFile(join(fixture, "delete.txt"), "a\nb\n");
  const folder = await run(["--json", join(fixture, "report.json")], false);
  assert(folder.code === 0, folder.err);
  await git(fixture, ["init", "-b", "master"]);
  await git(fixture, ["config", "user.name", "Mutrix fixture"]);
  await git(fixture, ["config", "user.email", "fixture@example.invalid"]);
  await git(fixture, ["add", "source.ts", "delete.txt"]);
  await git(fixture, ["commit", "-m", "baseline"]);
  await git(fixture, ["checkout", "-b", "feature"]);
  await writeFile(
    join(fixture, "source.ts"),
    "export function compute() {\n const result = 2;\n return result;\n}\n",
  );
  await writeFile(join(fixture, "new.ts"), "export const added = () => 1;\n");
  await rm(join(fixture, "delete.txt"));
  const args = [
    "--base",
    "master",
    "--output",
    join(fixture, "mutrix-report.html"),
    "--json",
    join(fixture, "report.json"),
    "--exclude",
    "report.json",
  ];
  const first = await run(args);
  assert(first.code === 0, first.err);
  const initial: Report = JSON.parse(await readFile(join(fixture, "report.json"), "utf8"));
  const sourceNode = initial.nodes.find(
    (node) => node.kind === "file" && node.path === "source.ts",
  );
  assert(sourceNode, "Skill workflow must discover the file ID from its JSON report");
  await writeFile(
    join(fixture, "summaries.json"),
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ nodeId: sourceNode.id, summary: "exe summary </script> & test" }],
    }),
  );
  args.push("--summaries", join(fixture, "summaries.json"));
  const beforeStatus = await git(fixture, ["status", "--porcelain=v1", "-z"]);
  const beforeContent = await readFile(join(fixture, "source.ts"), "utf8");
  const result = await run(args);
  assert(result.code === 0, result.err);
  const report: Report = JSON.parse(await readFile(join(fixture, "report.json"), "utf8"));
  const snapshot = (value: Report) =>
    JSON.stringify({
      base: value.meta.baseCommit,
      head: value.meta.headCommit,
      nodes: value.nodes.map(({ summary: _summary, ...node }) => node),
    });
  assert(
    snapshot(initial) === snapshot(report),
    "Summary regeneration changed the analysis snapshot",
  );
  assert(report.meta.mode === "changes", "Compiled exe must compare Git states");
  assert(
    report.nodes.find((node) => node.id === "file:source.ts")?.summary ===
      "exe summary </script> & test",
    "Compiled exe Summary failed",
  );
  assert(
    report.nodes.find((node) => node.id === "file:delete.txt")?.status === "deleted",
    "Compiled exe deletion failed",
  );
  assert(
    report.nodes.find((node) => node.id === "file:new.ts")?.status === "added",
    "Compiled exe new file failed",
  );
  assert(
    report.meta.files === 3,
    `Outputs and Summary should be excluded: ${report.nodes
      .filter((node) => node.kind === "file")
      .map((node) => node.path)
      .join(", ")}`,
  );
  assert(
    report.nodes[0].beforeLoc === 5 && report.nodes[0].afterLoc === 5,
    "Compiled exe LOC mismatch",
  );
  assert(
    (await readFile(join(fixture, "source.ts"), "utf8")) === beforeContent,
    "Source changed during analysis",
  );
  assert(
    (await git(fixture, ["status", "--porcelain=v1", "-z"])) === beforeStatus,
    "Repository status changed during regeneration",
  );
  const repeated = await run(args);
  assert(repeated.code === 0, repeated.err);
  const jsonComparison = await analyze({
    path: fixture,
    omit: [
      join(fixture, "mutrix-report.html"),
      join(fixture, "report.json"),
      join(fixture, "summaries.json"),
    ],
  });
  assert(
    JSON.stringify(
      report.nodes.map((node) => [
        node.id,
        node.beforeLoc,
        node.afterLoc,
        node.added,
        node.removed,
      ]),
    ) ===
      JSON.stringify(
        jsonComparison.nodes.map((node) => [
          node.id,
          node.beforeLoc,
          node.afterLoc,
          node.added,
          node.removed,
        ]),
      ),
    "Source and compiled analysis disagree",
  );
  const failure = await run(["--base", "missing"]);
  assert(
    failure.code !== 0 && failure.err.includes("Invalid base"),
    "CLI must fail on invalid explicit base",
  );
  const overwrite = await run(["--output", join(fixture, "source.ts")]);
  assert(
    overwrite.code !== 0 && overwrite.err.includes("not a Mutrix report"),
    "CLI must protect existing source",
  );
  const log = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    bunVersion: Bun.version,
    executable,
    pathContainsBunOrNode: false,
    structureWithoutGit: "passed",
    gitComparison: "passed",
    summary: "passed",
    skillJsonToSummaryToHtml: "passed",
    outputRegeneration: "passed",
    sourceParity: "passed",
    invalidBase: "passed",
    sourceProtection: "passed",
    output: result.out,
  };
  await Bun.write("artifacts/exe-verification.json", JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
} finally {
  await rm(fixture, { recursive: true, force: true });
}
