import { mkdir, writeFile, rename, rm, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

/** Only generated reports may be overwritten; never replace a project's source file. */
export async function checkOutput(path: string, format: "html" | "json") {
  try {
    if (!(await stat(path)).isFile()) throw new Error(`Output is not a file: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const text = await readFile(path, "utf8");
  let generated = false;
  if (format === "html")
    generated = text.includes('<script id="mutrix-data" type="application/json">');
  else {
    try {
      const report = JSON.parse(text);
      generated =
        report.schemaVersion === 1 &&
        typeof report.rootId === "string" &&
        Array.isArray(report.nodes) &&
        !!report.meta;
    } catch {
      /* An existing non-report file is never overwritten. */
    }
  }
  if (!generated)
    throw new Error(
      `Output already exists and is not a Mutrix report: ${path}. Choose another output path.`,
    );
}

export async function save(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
