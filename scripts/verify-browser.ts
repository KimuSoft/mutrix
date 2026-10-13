import { chromium } from "@playwright/test";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cpus, platform, release, totalmem } from "node:os";
import { demoReport } from "../src/viewer/demo";
import { renderHtml } from "../src/report/html";
import { benchmarkReport } from "./benchmark";
import { fileIcon } from "../src/viewer/lib/file-icons";
import { buildLayout } from "../src/viewer/chart/layout";
import { fitColumns } from "../src/viewer/chart/columns";
import { nodeFill } from "../src/shared/colors";
import type { ChartCamera } from "../src/viewer/chart/camera";
import { verifyAxisNavigation, verifyTouchNavigation } from "./verify-navigation";
import { verifyScrollArea } from "./verify-scroll-area";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const template = await readFile("dist/viewer/index.html", "utf8");
const artifacts = resolve("artifacts");
await mkdir(`${artifacts}/moved`, { recursive: true });
await writeFile(`${artifacts}/mutrix-demo.html`, renderHtml(template, demoReport()));
await copyFile(`${artifacts}/mutrix-demo.html`, `${artifacts}/moved/report.html`);
const executablePath =
  process.env.MUTRIX_BROWSER ??
  (platform() === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 940 },
  colorScheme: "light",
});
const errors: string[] = [];
const externalRequests: string[] = [];
await context.route(/^https?:/, (route) => {
  externalRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
async function painted() {
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __mutrixMetrics: { firstPaint?: number } }).__mutrixMetrics
        ?.firstPaint,
  );
}
async function chartReady() {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".matrix-host > canvas");
    return (
      canvas &&
      canvas.width > 0 &&
      (window as unknown as { __mutrixMetrics: { camera?: ChartCamera } }).__mutrixMetrics.camera
    );
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function camera() {
  await chartReady();
  return page.evaluate(() => ({
    ...(window as unknown as { __mutrixMetrics: { camera: ChartCamera } }).__mutrixMetrics.camera,
  }));
}
async function assertCamera(expected: ChartCamera) {
  const restored = await camera();
  assert(
    Math.abs(restored.kx - expected.kx) < 0.001 &&
      Math.abs(restored.ky - expected.ky) < 0.001 &&
      Math.abs(restored.x - expected.x) < 0.5 &&
      Math.abs(restored.y - expected.y) < 0.5,
    `Previous camera was not restored: ${JSON.stringify({ expected, restored })}`,
  );
}
async function zoomAndPan() {
  await page.getByRole("button", { name: "배율 조정", exact: true }).click();
  await page.getByRole("button", { name: "가로 확대", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const box = await page.locator(".matrix-host > canvas").boundingBox();
  assert(box, "Canvas missing before pan");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 - 35, box.y + box.height * 0.4 - 25, { steps: 5 });
  await page.mouse.up();
  return camera();
}
try {
  const openedLinks: string[] = [];
  await page.exposeFunction("recordEditorLink", (uri: string) => openedLinks.push(uri));
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    const drawn: string[] = [];
    (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText = drawn;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.parentElement?.classList.contains("matrix-host")) {
        drawn.push(text);
        if (drawn.length > 2000) drawn.shift();
      }
      original.call(this, text, x, y, maxWidth);
    };
    document.addEventListener(
      "click",
      (event) => {
        const anchor = (event.target as Element).closest("a");
        if (anchor?.href.startsWith("vscode:")) {
          event.preventDefault();
          void (
            window as unknown as { recordEditorLink: (uri: string) => Promise<void> }
          ).recordEditorLink(anchor.href);
        }
      },
      true,
    );
  });
  await page.goto(pathToFileURL(`${artifacts}/moved/report.html`).href);
  await painted();
  const suitLoaded = await page.evaluate(async () => {
    const fonts = await document.fonts.load('500 12px "SUIT Variable"', "프로젝트 Mutrix");
    return fonts.length > 0 && fonts.every((font) => font.status === "loaded");
  });
  assert(suitLoaded, "Embedded SUIT must load offline from the moved report");
  assert(
    await page.locator('.tree-node svg[data-node-icon="package"]').count(),
    "Package root icon missing in tree",
  );
  await page.waitForFunction(() => {
    const drawn = (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText;
    return (
      drawn.includes("NEW") &&
      drawn.includes("DEL") &&
      drawn.includes("+176") &&
      drawn.includes("−228")
    );
  });
  await verifyScrollArea(page);
  const controlStyle = await page.locator(".chart-controls").evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    blur: getComputedStyle(element).backdropFilter,
  }));
  const corner = await page.locator(".chart-controls").evaluate((element) => {
    const toolbar = element.getBoundingClientRect();
    const region = element.closest(".matrix-region")!.getBoundingClientRect();
    return { left: toolbar.left - region.left, bottom: region.bottom - toolbar.bottom };
  });
  assert(
    Math.abs(corner.left - 10) < 0.5 && Math.abs(corner.bottom - 10) < 0.5,
    "Toolbar must sit 10px from the workspace corner",
  );
  assert(
    (await page.locator('.matrix-region [data-slot="scroll-area"]').count()) === 0,
    "ScrollArea must be confined to the Explorer",
  );
  assert(
    controlStyle.height <= 30 && controlStyle.blur.includes("blur"),
    `Chart controls must be compact with a blurred backdrop: ${JSON.stringify(controlStyle)}`,
  );
  assert(
    await page.getByRole("button", { name: "Summary 불러오기", exact: true }).isVisible(),
    "Offline viewer did not load",
  );
  const help = page.getByRole("button", { name: "차트 사용법", exact: true });
  const guide = page.getByRole("dialog", { name: "차트 사용법 안내", exact: true });
  await help.click();
  assert(await guide.isVisible(), "Chart help popup did not open");
  await page.screenshot({ path: `${artifacts}/mutrix-help.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert(
    await help.evaluate((button) => document.activeElement === button),
    "Escape must restore help trigger focus",
  );
  assert((await guide.count()) === 0, "Escape did not close chart help");
  await help.click();
  await help.click();
  assert((await guide.count()) === 0, "Help toggle did not close chart help");
  await help.click();
  await page.locator(".project-label").click();
  assert((await guide.count()) === 0, "Outside click did not close chart help");
  const fonts = await page
    .locator("code, .inspector-title p, .branch-label, .zoom-trigger")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontFamily));
  assert(
    fonts.length > 0 && fonts.every((font) => font.includes("SUIT") && !font.includes("monospace")),
    "Paths, IDs and chart controls must use SUIT",
  );
  await verifyAxisNavigation(page, artifacts);
  await page
    .getByRole("textbox", { name: "Search paths and symbols" })
    .fill("file:src/editor/selection.ts");
  assert(
    (await page.locator(".search-result .node-badge").allTextContents()).join(" ") === "NEW",
    "Default WARN must not mark a 286 LOC file",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const settingsCamera = await camera();
  await page.getByRole("button", { name: "표시 설정", exact: true }).click();
  const warnInput = page.getByRole("spinbutton", { name: "WARN 기준 LOC", exact: true });
  await page.evaluate(() => {
    (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText.length = 0;
  });
  await warnInput.fill("200");
  await warnInput.press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".search-result .node-badge.warning")?.textContent === "WARN",
  );
  assert(
    (await page.locator(".search-result .node-badge").allTextContents()).join(" ") === "NEW WARN",
    "NEW and WARN must coexist",
  );
  const warningColor = await page
    .locator(".search-result .node-badge.warning")
    .evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      foreground: getComputedStyle(element).color,
    }));
  assert(
    warningColor.background === "rgb(253, 224, 71)" && warningColor.foreground === "rgb(66, 32, 6)",
    "WARN must have a yellow background with dark readable text",
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  assert(
    (await page
      .locator(".search-result .node-badge.warning")
      .evaluate((element) => getComputedStyle(element).backgroundColor)) === "rgb(250, 204, 21)",
    "Dark theme WARN must remain yellow",
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await page.getByRole("button", { name: "표시 설정", exact: true }).click();
  await assertCamera(settingsCamera);
  await page.waitForFunction(() =>
    (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText.includes("WARN"),
  );
  await warnInput.fill("0");
  await warnInput.press("Enter");
  assert(
    (await warnInput.inputValue()) === "200",
    "Invalid threshold should restore the applied value",
  );
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  assert(
    (await page.locator(".search-result .node-badge.warning").count()) === 0,
    "Reset should restore the default threshold",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  // Exercise actual canvas hit-testing with tapered columns, not just tree navigation.
  const initialCanvas = page.locator(".matrix-host > canvas");
  const initialBox = await initialCanvas.boundingBox();
  assert(initialBox, "Initial canvas missing");
  await chartReady();
  await initialCanvas.dblclick({
    position: {
      x: 72,
      y: initialBox.height * 0.3,
    },
  });
  assert(
    (await page.locator(".chart-breadcrumb nav button").last().textContent()) === "src",
    "Tapered canvas double-click should focus the src folder",
  );
  await chartReady();
  await page.screenshot({ path: `${artifacts}/mutrix-focused.png`, fullPage: true });
  await initialCanvas.dblclick({ position: { x: 24, y: initialBox.height * 0.3 } });
  assert(
    (await page.locator(".chart-breadcrumb nav button").count()) === 1,
    "Double-clicking the focused context should return to the project",
  );
  await chartReady();
  const projectCamera = await zoomAndPan();
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("folder:src");
  await page.locator(".search-result").first().dblclick();
  await chartReady();
  const folderCamera = await zoomAndPan();
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("folder:src/editor");
  await page.locator(".search-result").first().dblclick();
  await chartReady();
  await initialCanvas.dblclick({ position: { x: 24, y: initialBox.height * 0.3 } });
  assert(
    (await page.locator(".chart-breadcrumb nav button").last().textContent()) === "src",
    "Nested toggle should return one level",
  );
  await chartReady();
  await assertCamera(folderCamera);
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("folder:src");
  await page.locator(".search-result").first().dblclick();
  await chartReady();
  await assertCamera(projectCamera);
  assert(
    await page.getByRole("button", { name: "Go back", exact: true }).isDisabled(),
    "Toggling back must consume history",
  );
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await chartReady();
  await page.locator(".minimap canvas").click({ position: { x: 110, y: 40 } });
  await chartReady();
  assert(
    (await page.getByRole("button", { name: "배율 조정", exact: true }).textContent()) === "1.0×",
    "Minimap navigation should preserve zoom",
  );
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await chartReady();
  await page.screenshot({ path: `${artifacts}/mutrix-overview.png`, fullPage: true });
  await page
    .getByRole("textbox", { name: "Search paths and symbols" })
    .fill("file:src/editor/document.ts");
  await page.locator(".search-result").first().dblclick();
  await page.waitForFunction(
    () => document.querySelector(".inspector h2")?.textContent === "document.ts",
  );
  await page.waitForTimeout(50);
  assert(
    openedLinks.length === 1 && openedLinks[0].includes("src/editor/document.ts"),
    "File search double-click must execute its editor link",
  );
  assert(
    (await page.locator(".chart-breadcrumb nav button").count()) === 1,
    "Opening a file changed chart focus",
  );
  await page
    .getByRole("textbox", { name: "Search paths and symbols" })
    .fill("file:src/editor/legacy.ts");
  await page.locator(".search-result").first().dblclick();
  assert(
    await page.getByRole("button", { name: "Open in VS Code", exact: true }).isDisabled(),
    "Deleted file editor link must be disabled",
  );
  assert(openedLinks.length === 1, "Deleted file launched an editor link");
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("");
  const linkReport = demoReport();
  const linkLayout = buildLayout(
    new Map(linkReport.nodes.map((n) => [n.id, n])),
    linkReport.rootId,
    { changed: false, extension: "", sort: "path" },
  )!;
  const linkBox = (await initialCanvas.boundingBox())!;
  const linkColumns = fitColumns(linkLayout.root, linkBox.width);
  const linkNode = linkLayout.nodes.find((n) => n.data.node.id === "file:src/editor/document.ts")!;
  await initialCanvas.dblclick({
    position: {
      x: linkColumns.positions.get(linkNode.data.node.id)!.start + 24,
      y: (((linkNode.x0 + linkNode.x1) / 2) * linkBox.height) / linkLayout.total,
    },
  });
  await page.waitForTimeout(50);
  assert(
    Number(openedLinks.length) === 2,
    "Canvas file double-click did not launch its editor link",
  );
  assert(
    (await page.locator(".chart-breadcrumb nav button").count()) === 1,
    "Canvas file activation changed chart focus",
  );
  // SVG silhouettes must match in tree/search, Inspector, and the offline Canvas.
  for (const path of ["src/ui/Editor.tsx", "src/editor/commands.ts", "tests/editor.test.ts"]) {
    const expected = fileIcon(path)!;
    await page.getByRole("textbox", { name: "Search paths and symbols" }).fill(`file:${path}`);
    const result = page.locator(".search-result").first();
    assert(
      (await result.locator("svg[data-file-icon] path").getAttribute("d")) === expected.path,
      `Wrong search logo for ${path}`,
    );
    await result.click();
    await chartReady();
    assert(
      (await page.locator(".node-symbol svg").getAttribute("data-file-icon")) === expected.slug,
      `Wrong Inspector logo for ${path}`,
    );
    const report = demoReport();
    const layout = buildLayout(new Map(report.nodes.map((n) => [n.id, n])), report.rootId, {
      changed: false,
      extension: "",
      sort: "path",
    })!;
    const node = layout.nodes.find((n) => n.data.node.id === `file:${path}`)!;
    const box = await initialCanvas.boundingBox();
    assert(box, "Canvas missing during logo check");
    const columns = fitColumns(layout.root, box.width);
    const top = (node.x0 * box.height) / layout.total + 0.6;
    const nodeHeight = ((node.x1 - node.x0) * box.height) / layout.total - 1.2;
    const baseline = top + (nodeHeight >= 38 ? 20 : nodeHeight / 2 + 4);
    const difference = await initialCanvas.evaluate(
      (element, icon) => {
        const source = element as HTMLCanvasElement;
        const ratio = window.devicePixelRatio || 1;
        const reference = document.createElement("canvas");
        reference.width = Math.ceil(15 * ratio);
        reference.height = Math.ceil(15 * ratio);
        const ctx = reference.getContext("2d")!;
        ctx.fillStyle = icon.background;
        ctx.fillRect(0, 0, reference.width, reference.height);
        const blank = ctx.getImageData(0, 0, reference.width, reference.height).data;
        ctx.translate(
          icon.x * ratio - Math.floor(icon.x * ratio),
          icon.y * ratio - Math.floor(icon.y * ratio),
        );
        ctx.scale((ratio * 14) / 24, (ratio * 14) / 24);
        ctx.fillStyle = "#171717";
        if (icon.stroke) {
          ctx.strokeStyle = "#171717";
          ctx.lineWidth = 1.65;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke(new Path2D(icon.path));
        } else ctx.fill(new Path2D(icon.path));
        const expected = ctx.getImageData(0, 0, reference.width, reference.height).data;
        const actual = source
          .getContext("2d")!
          .getImageData(
            Math.floor(icon.x * ratio),
            Math.floor(icon.y * ratio),
            reference.width,
            reference.height,
          ).data;
        let error = 0,
          blankError = 0;
        for (let i = 0; i < expected.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            error += Math.abs(expected[i + c] - actual[i + c]);
            blankError += Math.abs(blank[i + c] - actual[i + c]);
          }
        }
        return {
          error: error / (reference.width * reference.height * 3),
          blankError: blankError / (reference.width * reference.height * 3),
        };
      },
      {
        path: expected.path,
        stroke: !!expected.stroke,
        background: nodeFill(node.data.node, true, false),
        x: columns.positions.get(node.data.node.id)!.start + 12,
        y: baseline - 12,
      },
    );
    assert(
      difference.error < difference.blankError * 0.5,
      `Canvas did not paint the ${expected.slug} logo (${JSON.stringify(difference)})`,
    );
  }
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("undo");
  await page.locator(".search-result").first().click();
  assert((await page.locator(".inspector h2").textContent()) === "undo", "Search selection failed");
  await page.getByRole("button", { name: "영역 확대", exact: true }).click();
  await chartReady();
  await page.waitForFunction(() => {
    const drawn = (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText;
    return (
      drawn.some((text) => text.includes("Undo 경계")) &&
      drawn.some((text) => text.includes("@returns 복원한 문서"))
    );
  });
  assert(
    (await page.locator(".inspector .summary-text, .inspector .documentation-text").count()) === 0,
    "Descriptions should be on chart nodes",
  );
  await page.screenshot({ path: `${artifacts}/mutrix-node-description.png`, fullPage: true });
  const injection = "</script><img src=x onerror=alert(1)> · 테스트 & 설명";
  await page.locator('input[type="file"]').setInputFiles({
    name: "summaries.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          { nodeId: "scope:src/editor/history.ts#function:undo~1", summary: injection },
          { nodeId: "scope:src/editor/history.ts#function:undo~1", summary: "duplicate" },
          { nodeId: "unknown", summary: "missing" },
        ],
      }),
    ),
  });
  await page.waitForFunction(() =>
    (window as unknown as { __mutrixCanvasText: string[] }).__mutrixCanvasText.some((text) =>
      text.includes("</script><img"),
    ),
  );
  const descriptionBox = (await initialCanvas.boundingBox())!;
  await page.mouse.move(descriptionBox.x + 24, descriptionBox.y + descriptionBox.height * 0.4);
  await page.locator(".tooltip-summary").waitFor();
  assert(
    (await page.locator(".tooltip-summary").textContent()) === `변경: ${injection}`,
    "Loaded Summary did not reach the node tooltip",
  );
  assert((await page.locator("img").count()) === 0, "Summary markup executed");
  assert(
    (await page.locator(".tooltip-documentation").textContent())?.includes("@returns"),
    "Loading a Summary must preserve source documentation",
  );
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("");
  await page.getByRole("combobox", { name: "File type filter" }).selectOption(".tsx");
  assert(
    (await page.locator(".scope-badge").textContent())?.includes(".tsx"),
    "Filter scope missing",
  );
  await page.getByRole("checkbox", { name: "변경된 영역만" }).check();
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  assert(
    !(await page.getByRole("checkbox", { name: "변경된 영역만" }).isChecked()),
    "Structure should clear changes filter",
  );
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await page.getByRole("combobox", { name: "File type filter" }).selectOption("");
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("document.ts");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".zoom-trigger")?.textContent === "1.5×");
  await page.locator(".search-result").first().dblclick();
  await page.getByRole("button", { name: "영역 확대", exact: true }).click();
  assert(
    (await page.locator(".chart-breadcrumb").textContent())?.includes("document.ts"),
    "Focus/breadcrumb failed",
  );
  await page.waitForFunction(() => document.querySelector(".zoom-trigger")?.textContent === "1.0×");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("legacy.ts");
  await page.locator(".search-result").first().click();
  assert(
    await page.getByRole("button", { name: "Open in VS Code", exact: true }).isDisabled(),
    "Deleted file editor action should be disabled",
  );
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("document.ts");
  await page.locator(".search-result").first().click();
  await page.getByRole("textbox", { name: "Search paths and symbols" }).fill("");
  await page.getByRole("button", { name: "Dismiss notice", exact: true }).click();
  await chartReady();
  await page.screenshot({ path: `${artifacts}/mutrix-inspector.png`, fullPage: true });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  assert((await page.locator("html").getAttribute("class")) === "dark", "Theme toggle failed");
  await chartReady();
  await page.waitForTimeout(180); // Allow the UI's color transitions to finish for visual QA.
  await page.screenshot({ path: `${artifacts}/mutrix-dark.png`, fullPage: true });
  await page.getByRole("button", { name: "3 diagnostics", exact: true }).click();
  await page.getByRole("dialog", { name: "Analysis diagnostics", exact: true }).waitFor();
  assert(
    (await page.locator(".diagnostics-dialog").textContent())?.includes("Duplicate Summary ID"),
    "Summary diagnostics missing",
  );
  await page.keyboard.press("Escape");
  assert(
    !(await page.getByRole("dialog", { name: "Analysis diagnostics", exact: true }).isVisible()),
    "Diagnostic dialog should close with Escape",
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await painted();
  assert(
    (await page.locator(".explorer").count()) === 0 &&
      (await page.locator(".inspector").count()) === 0,
    "Mobile should open directly on the chart",
  );
  await chartReady();
  await page.screenshot({ path: `${artifacts}/mutrix-mobile.png`, fullPage: true });
  await help.click();
  const mobileGuide = await guide.boundingBox();
  assert(
    mobileGuide &&
      mobileGuide.x >= 0 &&
      mobileGuide.x + mobileGuide.width <= 390 &&
      mobileGuide.y >= 0,
    "Mobile help popup must fit within the viewport",
  );
  await page.screenshot({ path: `${artifacts}/mutrix-mobile-help.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Mobile horizontal overflow",
  );
  await verifyTouchNavigation(page, artifacts);
  await page.setViewportSize({ width: 1440, height: 940 });
  const big = benchmarkReport();
  assert(big.nodes.length === 100000, "Benchmark size must be exactly 100k");
  await writeFile(`${artifacts}/benchmark-100k.html`, renderHtml(template, big));
  await page.goto(pathToFileURL(`${artifacts}/benchmark-100k.html`).href);
  await painted();
  const firstPaint = await page.evaluate(
    () =>
      (window as unknown as { __mutrixMetrics: { firstPaint: number } }).__mutrixMetrics.firstPaint,
  );
  const box = await page.locator(".matrix-host > canvas").boundingBox();
  assert(box, "Canvas missing");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  // Record zoom and drag frames, excluding initial layout paint.
  await page.evaluate(() => {
    (window as unknown as { __mutrixMetrics: { frames: number[] } }).__mutrixMetrics.frames = [];
  });
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -70);
    await page.waitForTimeout(25);
  }
  await page.mouse.down();
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(box.x + box.width * 0.5 + i * 5, box.y + box.height * 0.5 + i * 4);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  const metrics = await page.evaluate(
    () =>
      (window as unknown as { __mutrixMetrics: { frames: number[]; drawn: number } })
        .__mutrixMetrics,
  );
  const durations = [...metrics.frames].sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
  const result = {
    measuredAt: new Date().toISOString(),
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0].model,
      cores: cpus().length,
      memoryGiB: Math.round(totalmem() / 1024 ** 3),
      browser: browser.version(),
      viewport: "1440x940",
      headless: true,
    },
    nodes: big.nodes.length,
    firstPaintMs: Math.round(firstPaint),
    frameP95Ms: +p95.toFixed(2),
    measuredFrames: durations.length,
    drawnItems: metrics.drawn,
    offlineExternalRequests: externalRequests,
    pageErrors: errors,
  };
  await writeFile(`${artifacts}/verification.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert(firstPaint <= 5000, `Initial paint exceeded 5s: ${firstPaint}`);
  assert(p95 <= 50, `Frame p95 exceeded 50ms: ${p95}`);
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  assert(externalRequests.length === 0, "Viewer attempted external network requests");
  console.log(
    "Browser verification passed: offline, moved report, search, selection, summaries, filters, focus/history, deleted actions, themes, mobile, 100k benchmark.",
  );
} finally {
  await browser.close();
}
