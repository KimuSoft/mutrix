import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { demoReport } from "../src/viewer/demo";
import { renderHtml } from "../src/report/html";

const template = await Bun.file("dist/viewer/index.html").text();
const report = demoReport();
await mkdir("artifacts", { recursive: true });
await Bun.write("artifacts/mutrix-demo.html", renderHtml(template, report));
await Bun.write("artifacts/mutrix-demo.json", JSON.stringify(report, null, 2));
console.log(resolve("artifacts/mutrix-demo.html"));
