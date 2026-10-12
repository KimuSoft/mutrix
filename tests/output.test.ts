import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkOutput, save } from "../src/cli/output";

test("report output preserves existing project files and permits report regeneration", async () => {
  const root = await mkdtemp(join(tmpdir(), "mutrix-output-"));
  try {
    const source = join(root, "index.html");
    await writeFile(source, "<html>source</html>");
    await expect(checkOutput(source, "html")).rejects.toThrow("not a Mutrix report");
    expect(await readFile(source, "utf8")).toBe("<html>source</html>");
    const output = join(root, "nested", "report.html");
    await checkOutput(output, "html");
    await save(output, '<script id="mutrix-data" type="application/json">{}</script>');
    await checkOutput(output, "html");
    await save(
      output,
      '<script id="mutrix-data" type="application/json">{"updated":true}</script>',
    );
    expect(await readFile(output, "utf8")).toContain("updated");
    await writeFile(join(root, "config.json"), '{"source":true}');
    await expect(checkOutput(join(root, "config.json"), "json")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
