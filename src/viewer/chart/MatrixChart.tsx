import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Scan, Layers3 } from "lucide-react";
import type { ReportNode } from "../../shared/types";
import type { ChartLayout } from "./layout";
import { visibleItems, type DrawItem } from "./lod";
import { paint, itemRect, type PaintOptions } from "./paint";
import { Button } from "../components/ui/button";
import { format, signed } from "../lib/utils";
import { fitColumns, miniatureColumns } from "./columns";
import { ChartHelp } from "../components/ChartHelp";
import { ZoomControls } from "../components/ZoomControls";
import { NodeBadge } from "../components/NodeBadge";
import { DisplaySettings } from "../components/DisplaySettings";
import {
  constrainCamera,
  fitBand,
  identityCamera,
  visibleWorld,
  type ChartCamera,
  type ZoomAxis,
} from "./camera";
import { bindNavigation } from "./navigation";

interface Props {
  warnLoc: number;
  onWarnLoc: (value: number) => void;
  layout?: ChartLayout;
  dark: boolean;
  changes: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  initialCamera: ChartCamera;
  onCameraChange: (camera: ChartCamera) => void;
}
export function MatrixChart({
  warnLoc,
  onWarnLoc,
  layout,
  dark,
  changes,
  selected,
  onSelect,
  onFocus,
  initialCamera,
  onCameraChange,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState<ZoomAxis>("both");
  const actions = useRef({ selected, onSelect, onFocus, onCameraChange, axis });
  actions.current = { selected, onSelect, onFocus, onCameraChange, axis };
  const previousSetup = useRef<{ layout: ChartLayout; initialCamera: ChartCamera } | undefined>(
    undefined,
  );
  const lastCamera = useRef(initialCamera);
  const api = useRef<{
    scale: (factor: number, axis?: ZoomAxis) => void;
    reset: () => void;
    move: (event: React.MouseEvent) => void;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: ReportNode;
    count: number;
    x: number;
    y: number;
  }>();
  const [displayCamera, setDisplayCamera] = useState(initialCamera);
  useEffect(() => {
    setTooltip(undefined);
    if (!canvas.current || !host.current || !layout) return;
    const element = canvas.current,
      container = host.current;
    const ctx = element.getContext("2d")!;
    let width = 1,
      height = 1,
      sy = 1;
    let columns = fitColumns(layout.root, 1);
    const startingCamera =
      previousSetup.current?.initialCamera !== initialCamera
        ? initialCamera
        : previousSetup.current.layout === layout
          ? lastCamera.current
          : identityCamera();
    previousSetup.current = { layout, initialCamera };
    let camera = startingCamera;
    const bounds = () => ({ width, height, worldWidth: Math.max(width, columns.width) });
    let items: DrawItem[] = [],
      options: PaintOptions;
    let frame = 0,
      hovering: string | undefined;
    let active = true;
    const render = () => {
      frame = 0;
      const started = performance.now();
      options = {
        width,
        height,
        columns,
        lineScale: sy,
        camera,
        dark,
        changes,
        warnLoc,
        selected: actions.current.selected,
        hovered: hovering,
      };
      const world = visibleWorld(camera, width, height);
      items = visibleItems(layout.root, {
        left: world.left,
        right: world.right,
        top: world.top / sy,
        bottom: world.bottom / sy,
        pixelsPerLine: sy * camera.ky,
        columns,
      });
      paint(ctx, items, options);
      paintMini();
      setDisplayCamera(camera);
      const metrics = (
        window as unknown as {
          __mutrixMetrics: {
            firstPaint?: number;
            frames: number[];
            drawn: number;
            camera: ChartCamera;
          };
        }
      ).__mutrixMetrics;
      metrics.firstPaint ??= performance.now();
      metrics.frames.push(performance.now() - started);
      if (metrics.frames.length > 600) metrics.frames.shift();
      metrics.drawn = items.length;
      metrics.camera = camera;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    // Canvas does not repaint automatically when a webfont finishes loading.
    void document.fonts
      .load('500 12px "SUIT Variable"')
      .then(() => {
        if (active) schedule();
      })
      .catch(() => {
        // The configured system fallback remains usable if decoding fails.
      });
    const paintMini = () => {
      const miniCanvas = mini.current;
      if (!miniCanvas) return;
      const context = miniCanvas.getContext("2d")!;
      const mw = 126,
        mh = 78;
      context.clearRect(0, 0, mw, mh);
      const overview = visibleItems(layout.root, {
        left: 0,
        right: columns.width,
        top: 0,
        bottom: layout.total,
        pixelsPerLine: mh / (layout.total || 1),
        columns,
      });
      paint(context, overview, {
        width: mw,
        height: mh,
        columns: miniatureColumns(columns, mw),
        lineScale: mh / (layout.total || 1),
        camera: identityCamera(),
        dark,
        changes,
        warnLoc,
      });
      const view = visibleWorld(camera, width, height);
      const x = Math.max(0, view.left / columns.width) * mw;
      const y = Math.max(0, view.top / height) * mh;
      context.strokeStyle = dark ? "#f5f5f5" : "#262626";
      context.lineWidth = 1.5;
      context.strokeRect(
        x,
        y,
        Math.max(0, Math.min(mw, (view.right / columns.width) * mw) - x),
        Math.max(0, Math.min(mh, (view.bottom / height) * mh) - y),
      );
    };
    const update = (next: ChartCamera) => {
      camera = constrainCamera(next, bounds());
      lastCamera.current = camera;
      actions.current.onCameraChange(camera);
      hovering = undefined;
      setTooltip(undefined);
      schedule();
    };
    const navigation = bindNavigation(element, {
      camera: () => camera,
      bounds,
      axis: () => actions.current.axis,
      update,
    });
    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      sy = height / (layout.total || 1);
      columns = fitColumns(layout.root, width);
      update(camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const hit = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect(),
        x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      return items.find((item) => {
        const box = itemRect(item, options);
        return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
      });
    };
    const move = (event: MouseEvent) => {
      if (navigation.dragging()) return;
      const item = hit(event);
      const node = item?.nodes[0].data.node;
      if (hovering !== node?.id) {
        hovering = node?.id;
        schedule();
      }
      if (node) {
        const rect = element.getBoundingClientRect();
        setTooltip({
          node,
          count: item!.aggregate ? item!.nodes.length : 1,
          x: Math.min(event.clientX - rect.left + 14, width - 250),
          y: Math.min(
            event.clientY - rect.top + 14,
            height - (node.documentation || node.summary ? 210 : 95),
          ),
        });
      } else setTooltip(undefined);
      element.style.cursor = item ? "pointer" : "grab";
    };
    const click = (event: MouseEvent) => {
      const item = hit(event);
      if (item)
        actions.current.onSelect(
          item.aggregate ? item.nodes[0].parent!.data.node.id : item.nodes[0].data.node.id,
        );
    };
    const doubleClick = (event: MouseEvent) => {
      event.preventDefault();
      const item = hit(event);
      if (item?.aggregate) {
        update(fitBand(camera, item.x0 * sy, (item.x1 - item.x0) * sy, bounds()));
      } else if (item) actions.current.onFocus(item.nodes[0].data.node.id);
    };
    const leave = () => {
      setTooltip(undefined);
      hovering = undefined;
      schedule();
    };
    element.addEventListener("mousemove", move);
    element.addEventListener("click", click);
    element.addEventListener("dblclick", doubleClick);
    element.addEventListener("mouseleave", leave);
    api.current = {
      scale: navigation.scale,
      reset: navigation.reset,
      move: (event) => {
        const rect = mini.current!.getBoundingClientRect();
        const x =
          Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * columns.width;
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * height;
        navigation.moveTo({ x, y });
      },
    };
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      navigation.destroy();
      element.removeEventListener("mousemove", move);
      element.removeEventListener("click", click);
      element.removeEventListener("dblclick", doubleClick);
      element.removeEventListener("mouseleave", leave);
      api.current = null;
    };
  }, [layout, dark, changes, initialCamera, warnLoc]);
  useEffect(() => {
    // Redraw selection without rebuilding the layout or resetting the camera.
    if (canvas.current) canvas.current.dispatchEvent(new MouseEvent("mouseleave"));
  }, [selected]);
  return (
    <div className="matrix-region">
      <div className="axis-label">
        {layout?.root.data.node.plan ? "계획 표시 LOC · 추정" : changes ? "비교 표시 LOC" : "LOC"}
        <span>↑{changes && ` ${format(layout?.total ?? 0)}`}</span>
      </div>
      <div className="matrix-host" ref={host}>
        {layout && layout.total > 0 ? (
          <canvas
            ref={canvas}
            tabIndex={0}
            aria-label="Code matrix. Use plus/minus to zoom, Home to reset. Select nodes using the tree or search."
          />
        ) : (
          <div className="empty-state">
            <Layers3 size={28} />
            <h3>표시할 코드가 없습니다</h3>
            <p>필터를 조정하거나 탐색 트리에서 0 LOC 노드를 선택하세요.</p>
          </div>
        )}
        {tooltip && (
          <div
            className="chart-tooltip"
            style={{ left: Math.max(4, tooltip.x), top: Math.max(4, tooltip.y) }}
          >
            <strong>
              {tooltip.count > 1 ? `${tooltip.count}개 영역 · 확대하여 보기` : tooltip.node.name}
              {tooltip.count === 1 && (
                <NodeBadge node={tooltip.node} changes={changes} warnLoc={warnLoc} />
              )}
            </strong>
            <span>
              {tooltip.count > 1
                ? "더블클릭으로 집계 영역 확대"
                : tooltip.node.path || "Project root"}
            </span>
            {tooltip.count === 1 && (
              <span>
                {tooltip.node.plan &&
                  `${format(tooltip.node.beforeLoc)} → ${tooltip.node.plan.estimated ? "약 " : "규모 미정 · "}`}
                {format(tooltip.node.afterLoc)} LOC{" "}
                {changes &&
                  `· ${signed(tooltip.node.delta)} · +${tooltip.node.added} / −${tooltip.node.removed}`}
              </span>
            )}
            {tooltip.count === 1 && tooltip.node.summary && (
              <p className="tooltip-summary">
                {tooltip.node.plan ? "계획" : "변경"}: {tooltip.node.summary}
              </p>
            )}
            {tooltip.count === 1 && (
              <p className="tooltip-documentation">
                {tooltip.node.status === "deleted"
                  ? tooltip.node.documentation?.before
                  : tooltip.node.documentation?.after}
              </p>
            )}
          </div>
        )}
        {layout && layout.total > 0 && (
          <button
            className="minimap"
            aria-label="Move chart viewport"
            onClick={(event) => api.current?.move(event)}
          >
            <canvas width={126} height={78} ref={mini} />
          </button>
        )}
      </div>
      <div className="chart-controls">
        <Button
          variant="ghost"
          size="icon"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => api.current?.scale(1 / 1.5)}
        >
          <Minus />
        </Button>
        <ZoomControls
          camera={displayCamera}
          axis={axis}
          onAxis={setAxis}
          onZoom={(factor, axis) => api.current?.scale(factor, axis)}
        />
        <Button
          variant="ghost"
          size="icon"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => api.current?.scale(1.5)}
        >
          <Plus />
        </Button>
        <i />
        <Button
          variant="ghost"
          size="icon"
          title="Reset view"
          aria-label="Reset view"
          onClick={() => api.current?.reset()}
        >
          <Scan />
        </Button>
        <ChartHelp />
        <DisplaySettings warnLoc={warnLoc} onWarnLoc={onWarnLoc} />
      </div>
    </div>
  );
}
