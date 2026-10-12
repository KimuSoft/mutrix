import {
  centerOn,
  identityCamera,
  zoomAt,
  type CameraBounds,
  type ChartCamera,
  type ZoomAxis,
} from "./camera";

interface Options {
  camera: () => ChartCamera;
  bounds: () => CameraBounds;
  axis: () => ZoomAxis;
  update: (camera: ChartCamera) => void;
}

/** Pointer capture keeps pans/pinches coherent when a finger leaves the Canvas. */
export function bindNavigation(element: HTMLCanvasElement, options: Options) {
  const pointers = new Map<number, { x: number; y: number; originX: number; originY: number }>();
  let suppressClick = false;
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  // The viewer's camera setter applies pan bounds to every input and resize.
  const update = options.update;
  const scale = (
    factor: number,
    axis = options.axis(),
    point = { x: options.bounds().width / 2, y: options.bounds().height / 2 },
  ) => update(zoomAt(options.camera(), factor, axis, point));
  const pan = (dx: number, dy: number) => {
    const camera = options.camera();
    update({ ...camera, x: camera.x + dx, y: camera.y + dy });
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || pointers.size >= 2) return;
    if (!pointers.size) suppressClick = false;
    else suppressClick = true;
    const point = local(event);
    pointers.set(event.pointerId, { ...point, originX: point.x, originY: point.y });
    element.setPointerCapture(event.pointerId);
    element.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { ...previous, ...local(event) };
    if (Math.hypot(next.x - next.originX, next.y - next.originY) > 4) suppressClick = true;
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)![1];
      const before = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const after = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
      const distance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const factor = distance > 1 ? Math.hypot(next.x - other.x, next.y - other.y) / distance : 1;
      const camera = zoomAt(options.camera(), factor, options.axis(), before);
      update({ ...camera, x: camera.x + after.x - before.x, y: camera.y + after.y - before.y });
    } else pan(next.x - previous.x, next.y - previous.y);
    pointers.set(event.pointerId, next);
    event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  const click = (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? options.bounds().height : 1;
    if (event.shiftKey) pan(-(event.deltaX || event.deltaY) * unit, 0);
    else
      scale(
        2 ** Math.max(-10, Math.min(10, -event.deltaY * unit * 0.002 * (event.ctrlKey ? 10 : 1))),
        options.axis(),
        local(event),
      );
  };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") scale(1.5);
    else if (event.key === "-") scale(1 / 1.5);
    else if (event.key === "Home") update(identityCamera());
    else return;
    event.preventDefault();
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("lostpointercapture", up);
  element.addEventListener("click", click, true);
  element.addEventListener("dblclick", click, true);
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("keydown", key);
  return {
    scale,
    reset: () => update(identityCamera()),
    moveTo: (point: { x: number; y: number }) =>
      update(centerOn(options.camera(), point, options.bounds())),
    dragging: () => pointers.size > 0,
    destroy: () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("lostpointercapture", up);
      element.removeEventListener("click", click, true);
      element.removeEventListener("dblclick", click, true);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", key);
      for (const id of pointers.keys())
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      pointers.clear();
    },
  };
}
