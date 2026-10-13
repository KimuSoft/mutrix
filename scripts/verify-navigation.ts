import type { Page } from "@playwright/test";
import { demoReport } from "../src/viewer/demo";
import { buildLayout, reportIndex } from "../src/viewer/chart/layout";
import { fitColumns } from "../src/viewer/chart/columns";
import { itemRect } from "../src/viewer/chart/paint";
import { visibleItems } from "../src/viewer/chart/lod";
import { visibleWorld, type ChartCamera, type ZoomAxis } from "../src/viewer/chart/camera";

const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
async function camera(page: Page): Promise<ChartCamera> {
  return page.evaluate(
    () =>
      new Promise<ChartCamera>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({
              ...(window as unknown as { __mutrixMetrics: { camera: ChartCamera } }).__mutrixMetrics
                .camera,
            }),
          ),
        ),
      ),
  );
}
async function axis(page: Page, value: ZoomAxis) {
  await page.getByRole("button", { name: "배율 조정", exact: true }).click();
  await page
    .getByRole("radio", {
      name: value === "x" ? "가로" : value === "y" ? "세로" : "함께",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
}

export async function verifyAxisNavigation(page: Page, artifacts: string) {
  const canvas = page.locator(".matrix-host > canvas");
  const box = (await canvas.boundingBox())!;
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  await zoomIn.click();
  const threshold = await camera(page);
  await zoomIn.click();
  const capped = await camera(page);
  assert(near(threshold.kx, 1.5) && near(threshold.ky, 1.5), "Shared zoom must start on both axes");
  assert(
    capped.kx === threshold.kx && capped.x === threshold.x && near(capped.ky, 2.25),
    "Shared zoom widened a column past 1.5x",
  );
  await page.mouse.move(box.x + Math.floor(box.width / 2), box.y + Math.floor(box.height / 2));
  await page.mouse.wheel(0, -120);
  const more = await camera(page);
  assert(
    more.kx === capped.kx && more.x === capped.x && more.ky > capped.ky,
    "Shared wheel did not preserve the horizontal cap",
  );
  await page.mouse.wheel(0, 120);
  await zoomOut.click();
  const back = await camera(page);
  assert(
    near(back.kx, 1.5) && near(back.ky, 1.5) && near(back.x, threshold.x),
    "Shared zoom-out changed width before reaching 1.5x",
  );
  await zoomOut.click();
  const initial = await camera(page);
  assert(
    near(initial.kx, 1) && near(initial.ky, 1),
    "Shared zoom-out must shrink both axes below the threshold",
  );
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "배율 조정", exact: true }).click();
  await page.getByRole("radio", { name: "함께", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert(
    (await page.getByRole("radio", { name: "가로", exact: true }).getAttribute("aria-checked")) ===
      "true",
    "Axis selector keyboard navigation failed",
  );
  await page.getByRole("button", { name: "가로 확대", exact: true }).click();
  const horizontal = await camera(page);
  assert(
    near(horizontal.kx, 1.5) && horizontal.ky === 1 && horizontal.y === 0,
    "Horizontal zoom changed the vertical camera",
  );
  await page.getByRole("button", { name: "세로 확대", exact: true }).click();
  const different = await camera(page);
  assert(
    different.kx === horizontal.kx && different.x === horizontal.x && near(different.ky, 1.5),
    "Vertical zoom changed the horizontal camera",
  );
  await page.screenshot({ path: `${artifacts}/mutrix-axis-controls.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await axis(page, "y");
  const anchor = {
    x: Math.floor(box.x + box.width * 0.4) - box.x,
    y: Math.floor(box.y + box.height * 0.4) - box.y,
  };
  await page.mouse.move(box.x + anchor.x, box.y + anchor.y);
  await page.mouse.wheel(0, -120);
  const wheel = await camera(page);
  assert(
    wheel.kx === different.kx && wheel.x === different.x && wheel.ky > different.ky,
    "Wheel did not use the selected axis",
  );
  assert(
    near((anchor.y - wheel.y) / wheel.ky, (anchor.y - different.y) / different.ky),
    `Vertical wheel zoom moved its cursor anchor ${JSON.stringify({ anchor, different, wheel, box })}`,
  );
  await canvas.focus();
  await page.keyboard.press("+");
  assert(
    await canvas.evaluate((element) => getComputedStyle(element).outlineStyle !== "none"),
    "Keyboard users must retain a Canvas focus indicator",
  );
  const keyed = await camera(page);
  assert(
    keyed.kx === wheel.kx && near(keyed.ky, wheel.ky * 1.5),
    "Keyboard zoom did not use the selected axis",
  );
  await page.keyboard.press("Home");
  const reset = await camera(page);
  assert(
    reset.kx === 1 && reset.ky === 1 && reset.x === 0 && reset.y === 0,
    "Home did not reset both axes",
  );
  await axis(page, "x");
  await page.mouse.move(box.x + anchor.x, box.y + anchor.y);
  await page.mouse.wheel(0, -200);
  const beforePan = await camera(page);
  assert(
    beforePan.ky === 1 && beforePan.y === 0 && beforePan.kx > 1,
    "Horizontal wheel zoom changed the vertical camera",
  );
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 40);
  await page.keyboard.up("Shift");
  const panned = await camera(page);
  assert(
    near(panned.x, beforePan.x - 40) &&
      panned.kx === beforePan.kx &&
      panned.ky === beforePan.ky &&
      panned.y === beforePan.y,
    "Shift-wheel must only pan horizontally",
  );
  const selection = await page.locator(".node-id").textContent();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x - 10, box.y + box.height * 0.5, { steps: 8 });
  assert(
    await canvas.evaluate(
      (element) =>
        document.activeElement === element && getComputedStyle(element).outlineStyle === "none",
    ),
    "Pointer drag must focus Canvas without drawing a focus ring",
  );
  await page.mouse.up();
  assert(
    (await page.locator(".node-id").textContent()) === selection,
    "Drag release selected a node",
  );
  await page.getByRole("button", { name: "Reset view", exact: true }).click();

  // Hit-test an actual file after changing each scale independently.
  await page.getByRole("button", { name: "배율 조정", exact: true }).click();
  await page.getByRole("button", { name: "가로 확대", exact: true }).click();
  await page.getByRole("button", { name: "세로 확대", exact: true }).click();
  await page.getByRole("button", { name: "세로 확대", exact: true }).click();
  await page.keyboard.press("Escape");
  const unequal = await camera(page);
  const report = demoReport();
  const layout = buildLayout(reportIndex(report), report.rootId, {
    changed: false,
    extension: "",
    sort: "path",
  })!;
  const columns = fitColumns(layout.root, box.width),
    sy = box.height / layout.total;
  const options = {
    width: box.width,
    height: box.height,
    columns,
    lineScale: sy,
    camera: unequal,
    dark: false,
    changes: true,
  };
  const itemsFor = (value: ChartCamera) => {
    const world = visibleWorld(value, box.width, box.height);
    return visibleItems(layout.root, {
      left: 0,
      right: columns.width,
      top: world.top / sy,
      bottom: world.bottom / sy,
      pixelsPerLine: sy * value.ky,
      columns,
    });
  };
  const file = itemsFor(unequal).find((item) => {
    const rect = itemRect(item, options);
    return (
      !item.aggregate &&
      item.nodes[0].data.node.kind === "file" &&
      rect.x > 0 &&
      rect.x < box.width - 35 &&
      rect.y > 0 &&
      rect.y + rect.height < box.height - 60
    );
  });
  assert(file, "No visible file for independent hit-test");
  const rect = itemRect(file!, options);
  await canvas.click({ position: { x: rect.x + 12, y: rect.y + rect.height / 2 } });
  assert(
    (await page.locator(".node-id").textContent()) === file!.nodes[0].data.node.id,
    "Canvas hit-test disagrees with independent scales",
  );
  await page.locator(".minimap canvas").click({ position: { x: 75, y: 45 } });
  const mini = await camera(page);
  assert(mini.kx === unequal.kx && mini.ky === unequal.ky, "Minimap changed a scale");
  const world = visibleWorld(mini, box.width, box.height);
  assert(
    near((world.left + world.right) / 2, (75 / 126) * columns.width) &&
      near((world.top + world.bottom) / 2, (45 / 78) * box.height),
    "Minimap centered the wrong world position",
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  const themed = await camera(page);
  assert(
    near(themed.x, mini.x) &&
      near(themed.y, mini.y) &&
      themed.kx === mini.kx &&
      themed.ky === mini.ky,
    "Theme reset the camera",
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await page.setViewportSize({ width: 1300, height: 860 });
  const resized = await camera(page);
  assert(resized.kx === mini.kx && resized.ky === mini.ky, "Resize reset a scale");
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "배율 조정", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "세로 축소", exact: true }).click();
  await page.keyboard.press("Escape");
  const compressed = await camera(page);
  const band = itemsFor(compressed).find(
    (item) => item.aggregate && itemRect(item, { ...options, camera: compressed }).height > 1.2,
  );
  assert(band, "No LOD band in compressed fixture");
  const bandBox = itemRect(band!, { ...options, camera: compressed });
  await canvas.dblclick({ position: { x: bandBox.x + 12, y: bandBox.y + bandBox.height / 2 } });
  const expanded = await camera(page);
  assert(
    expanded.kx === compressed.kx && expanded.x === compressed.x && expanded.ky > compressed.ky,
    "LOD band expansion widened a column",
  );
  await axis(page, "both");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
}

export async function verifyTouchNavigation(page: Page, artifacts: string) {
  const box = (await page.locator(".matrix-host > canvas").boundingBox())!;
  const center = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.4 };
  const session = await page.context().newCDPSession(page);
  const pinch = async (vertical: boolean) => {
    const points = (distance: number) =>
      [-1, 1].map((sign, id) => ({
        id,
        x: center.x + (vertical ? 0 : sign * distance),
        y: center.y + (vertical ? sign * distance : 0),
      }));
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(30) });
    for (const distance of [36, 42, 48, 54, 60])
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: points(distance),
      });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  try {
    await axis(page, "x");
    await pinch(false);
    const horizontal = await camera(page);
    assert(
      near(horizontal.kx, 2) && horizontal.ky === 1 && horizontal.y === 0,
      "Real touch pinch changed an unselected axis",
    );
    await axis(page, "y");
    await pinch(true);
    const vertical = await camera(page);
    assert(
      near(vertical.ky, 2) && near(vertical.kx, horizontal.kx),
      "Vertical touch pinch did not preserve horizontal scale",
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 0, ...center }],
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -50);
    assert((await camera(page)).ky > vertical.ky, "Touch cancellation left navigation stuck");
    await page.getByRole("button", { name: "배율 조정", exact: true }).click();
    await page.screenshot({ path: `${artifacts}/mutrix-mobile-axis.png`, fullPage: true });
    await page.keyboard.press("Escape");
  } finally {
    await session.detach();
  }
  await axis(page, "both");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
}
