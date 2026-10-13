import type { Page } from "@playwright/test";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export async function verifyScrollArea(page: Page) {
  const search = page.getByRole("textbox", { name: "Search paths and symbols" });
  const viewport = page.locator('.tree-scroll-area [data-slot="scroll-area-viewport"]');
  await search.fill(".ts");
  const size = await viewport.evaluate((element) => ({
    height: element.clientHeight,
    contentHeight: element.scrollHeight,
    width: element.clientWidth,
    contentWidth: element.scrollWidth,
  }));
  assert(
    size.height > 100 && size.contentHeight > size.height,
    "ScrollArea must constrain a long result list to the sidebar",
  );
  assert(size.contentWidth <= size.width + 1, "ScrollArea search rows overflow horizontally");
  const box = await viewport.boundingBox();
  assert(box, "ScrollArea viewport missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 450);
  await page.waitForFunction(
    () => document.querySelector('[data-slot="scroll-area-viewport"]')!.scrollTop > 0,
  );
  const wheelTop = await viewport.evaluate((element) => element.scrollTop);
  await viewport.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(
    (top) => document.querySelector('[data-slot="scroll-area-viewport"]')!.scrollTop > top,
    wheelTop,
  );
  await viewport.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  const thumb = page.locator('[data-slot="scroll-area-thumb"]');
  await thumb.waitFor({ state: "visible" });
  const handle = await thumb.boundingBox();
  assert(handle, "ScrollArea custom thumb missing");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 80, {
    steps: 5,
  });
  await page.mouse.up();
  assert(
    (await viewport.evaluate((element) => element.scrollTop)) > 0,
    "ScrollArea thumb drag did not scroll",
  );
  await viewport.focus();
  await page.keyboard.press("Tab");
  const first = page.locator(".search-result").first();
  assert(
    await first.evaluate((element) => element === document.activeElement),
    "ScrollArea must preserve keyboard navigation into results",
  );
  await page.keyboard.press("Enter");
  assert(
    (await page.locator(".inspector h2").textContent()) ===
      (await first.locator("strong").evaluate((element) => element.firstChild?.textContent)),
    "Keyboard selection stopped working inside ScrollArea",
  );
  await search.fill("");
}
