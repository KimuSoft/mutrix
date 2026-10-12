import { expect, test } from "bun:test";
import {
  centerOn,
  constrainCamera,
  fitBand,
  identityCamera,
  MAX_SCALE,
  MIN_SCALE,
  visibleWorld,
  zoomAt,
} from "../src/viewer/chart/camera";

const bounds = { width: 800, height: 600, worldWidth: 1000 };
test("Independent zoom keeps the other axis exact and preserves the cursor's world point", () => {
  const original = { x: -120, y: -280, kx: 2, ky: 4 },
    cursor = { x: 200, y: 300 };
  const horizontal = zoomAt(original, 1.5, "x", cursor);
  expect(horizontal.ky).toBe(original.ky);
  expect(horizontal.y).toBe(original.y);
  expect((cursor.x - horizontal.x) / horizontal.kx).toBeCloseTo(
    (cursor.x - original.x) / original.kx,
  );
  const vertical = zoomAt(original, 0.8, "y", cursor);
  expect(vertical.kx).toBe(original.kx);
  expect(vertical.x).toBe(original.x);
  expect((cursor.y - vertical.y) / vertical.ky).toBeCloseTo((cursor.y - original.y) / original.ky);
  const both = zoomAt(original, 1.5, "both", cursor);
  expect(both.kx / both.ky).toBe(original.kx / original.ky);
});

test("Each axis clamps at its own limit and invalid zoom input does not corrupt the camera", () => {
  const original = { x: 0, y: 0, kx: MAX_SCALE, ky: 1 };
  expect(zoomAt(original, 10, "both", { x: 0, y: 0 })).toEqual({ ...original, ky: 10 });
  expect(zoomAt(identityCamera(), 0.0001, "x", { x: 0, y: 0 }).kx).toBe(MIN_SCALE);
  for (const factor of [NaN, Infinity, 0, -1])
    expect(zoomAt(original, factor, "both", { x: 0, y: 0 })).toEqual(original);
});

test("Pan limits, minimap centering and viewport bounds respect different scales", () => {
  const camera = constrainCamera({ x: -5000, y: 100, kx: 2, ky: 4 }, bounds);
  expect(camera).toEqual({ x: -1200, y: 0, kx: 2, ky: 4 });
  const centered = centerOn(camera, { x: 450, y: 200 }, bounds);
  const view = visibleWorld(centered, bounds.width, bounds.height);
  expect((view.left + view.right) / 2).toBe(450);
  expect((view.top + view.bottom) / 2).toBe(200);
  expect(view.right - view.left).toBe(400);
  expect(view.bottom - view.top).toBe(150);
  const shrunk = constrainCamera({ ...camera, kx: 0.5, ky: 0.5 }, bounds);
  expect(shrunk.x).toBe(150);
  expect(shrunk.y).toBe(150);
  const resized = constrainCamera(centered, { width: 400, height: 300, worldWidth: 1000 });
  expect(resized.kx).toBe(centered.kx);
  expect(resized.ky).toBe(centered.ky);
});

test("LOD band focus only enlarges vertical extent and leaves horizontal position intact", () => {
  const camera = { x: -200, y: -100, kx: 2, ky: 3 };
  const fitted = fitBand(camera, 250, 10, bounds);
  expect(fitted.kx).toBe(camera.kx);
  expect(fitted.x).toBe(camera.x);
  expect(fitted.ky).toBe(60);
  const view = visibleWorld(fitted, bounds.width, bounds.height);
  expect(view.top).toBe(250);
  expect(view.bottom).toBe(260);
});
