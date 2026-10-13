export interface ChartCamera {
  x: number;
  y: number;
  kx: number;
  ky: number;
}
export type ZoomAxis = "both" | "x" | "y";
export interface CameraBounds {
  width: number;
  height: number;
  worldWidth: number;
}
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 20000;
export const SHARED_X_LIMIT = 1.5;
export const identityCamera = (): ChartCamera => ({ x: 0, y: 0, kx: 1, ky: 1 });

const limitScale = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
const limitPosition = (value: number, viewport: number, world: number) =>
  world < viewport ? (viewport - world) / 2 : Math.max(viewport - world, Math.min(0, value));

/** Camera coordinates are CSS pixels in the fitted chart, before zoom. */
export function constrainCamera(camera: ChartCamera, bounds: CameraBounds): ChartCamera {
  return {
    ...camera,
    x: limitPosition(camera.x, bounds.width, bounds.worldWidth * camera.kx),
    y: limitPosition(camera.y, bounds.height, bounds.height * camera.ky),
  };
}

export function zoomAt(
  camera: ChartCamera,
  factor: number,
  axis: ZoomAxis,
  point: { x: number; y: number },
): ChartCamera {
  if (!Number.isFinite(factor) || factor <= 0) return camera;
  const ky = axis === "x" ? camera.ky : limitScale(camera.ky * factor);
  // The shared gesture follows vertical zoom; its horizontal part stops at 1.5x.
  // Keep a manually widened column intact rather than snapping it back to the cap.
  const kx =
    axis === "x"
      ? limitScale(camera.kx * factor)
      : axis === "y" || camera.kx > SHARED_X_LIMIT
        ? camera.kx
        : limitScale(
            Math.min(
              SHARED_X_LIMIT,
              (camera.kx * Math.min(ky, SHARED_X_LIMIT)) / Math.min(camera.ky, SHARED_X_LIMIT),
            ),
          );
  return {
    kx,
    ky,
    x: kx === camera.kx ? camera.x : point.x - ((point.x - camera.x) * kx) / camera.kx,
    y: ky === camera.ky ? camera.y : point.y - ((point.y - camera.y) * ky) / camera.ky,
  };
}

export function visibleWorld(camera: ChartCamera, width: number, height: number) {
  return {
    left: -camera.x / camera.kx,
    right: (width - camera.x) / camera.kx,
    top: -camera.y / camera.ky,
    bottom: (height - camera.y) / camera.ky,
  };
}

export function centerOn(
  camera: ChartCamera,
  point: { x: number; y: number },
  bounds: CameraBounds,
): ChartCamera {
  return {
    ...camera,
    x: bounds.width / 2 - point.x * camera.kx,
    y: bounds.height / 2 - point.y * camera.ky,
  };
}

/** Reveal a LOD band vertically without widening its column. */
export function fitBand(
  camera: ChartCamera,
  top: number,
  bandHeight: number,
  bounds: CameraBounds,
): ChartCamera {
  const ky = limitScale(bounds.height / Math.max(1, bandHeight));
  return { ...camera, ky, y: -top * ky };
}
