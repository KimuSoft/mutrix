import template from "../../dist/viewer/index.html" with { type: "text" };
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyze } from "../analysis";
import { attachSummaries, parseSummaries } from "../shared/summaries";
import { renderHtml } from "../report/html";
import { cliOptions, HELP } from "./args";
import { checkOutput, save } from "./output";

async function openReport(path: string) {
  const child =
    process.platform === "win32"
      ? Bun.spawn(["rundll32.exe", "url.dll,FileProtocolHandler", pathToFileURL(path).href], {
          stdout: "ignore",
          stderr: "pipe",
        })
      : Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", path], {
          stdout: "ignore",
          stderr: "pipe",
        });
  const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code) throw new Error(`Report saved, but browser launch failed: ${err}`);
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (options.version) {
    console.log("mutrix 0.1.0");
    return;
  }
  const output = resolve(options.output);
  const json = options.json ? resolve(options.json) : undefined;
  const summaries = options.summaries ? resolve(options.summaries) : undefined;
  const summaryDoc = summaries ? parseSummaries(await Bun.file(summaries).json()) : undefined;
  await checkOutput(output, "html");
  if (json) await checkOutput(json, "json");
  console.log(`Analyzing ${options.path} …`);
  const start = performance.now();
  const report = await analyze({
    path: options.path,
    base: options.base,
    exclude: options.exclude,
    omit: [output, json, summaries].filter((path): path is string => !!path),
  });
  if (summaryDoc) report.diagnostics.push(...attachSummaries(report.nodes, summaryDoc));
  // Bun's runtime honors type:text; older HTML module declarations still say HTMLBundle.
  const html = renderHtml(template as unknown as string, report);
  if (json) await save(json, JSON.stringify(report, null, 2));
  await save(output, html);
  const root = report.nodes.find((node) => node.id === report.rootId)!;
  console.log(
    `${report.meta.mode} · ${report.meta.files} files · ${root.afterLoc.toLocaleString()} LOC · +${root.added} / −${root.removed}`,
  );
  console.log(`Report: ${output}`);
  if (json) console.log(`JSON:   ${json}`);
  console.log(
    `Done in ${((performance.now() - start) / 1000).toFixed(2)}s. ${report.diagnostics.length} diagnostic(s).`,
  );
  for (const item of report.diagnostics.filter((item) => item.level === "warning"))
    console.warn(`Warning: ${item.path ? `${item.path}: ` : ""}${item.message}`);
  if (options.open) await openReport(output);
}

main().catch((error) => {
  console.error(`Mutrix: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
