import { useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { Minus, Plus, Scan, Layers3 } from "lucide-react";
import type { ReportNode } from "../../shared/types";
import type { ChartLayout } from "./layout";
import { visibleItems, type DrawItem } from "./lod";
import { paint, itemRect, type PaintOptions } from "./paint";
import { Button } from "../components/ui/button";
import { format, signed } from "../lib/utils";
import { fitColumns, miniatureColumns, projectColumn, unprojectColumn } from "./columns";

export interface ChartCamera {
  x: number;
  y: number;
  k: number;
}

interface Props {
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
  const actions = useRef({ selected, onSelect, onFocus, onCameraChange });
  actions.current = { selected, onSelect, onFocus, onCameraChange };
  const previousSetup = useRef<{ layout: ChartLayout; initialCamera: ChartCamera } | undefined>(
    undefined,
  );
  const lastCamera = useRef(initialCamera);
  const api = useRef<{
    scale: (factor: number) => void;
    reset: () => void;
    move: (event: React.MouseEvent) => void;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: ReportNode;
    count: number;
    x: number;
    y: number;
  }>();
  const [stats, setStats] = useState({ drawn: 0, scale: 1 });
  useEffect(() => {
    if (!canvas.current || !host.current || !layout) return;
    const element = canvas.current,
      container = host.current;
    const ctx = element.getContext("2d")!;
    let width = 1,
      height = 1,
      sy = 1;
    let columns = fitColumns(layout.width, 1);
    const startingCamera =
      previousSetup.current?.initialCamera !== initialCamera
        ? initialCamera
        : previousSetup.current.layout === layout
          ? lastCamera.current
          : { x: 0, y: 0, k: 1 };
    previousSetup.current = { layout, initialCamera };
    let transform: ZoomTransform = zoomIdentity
      .translate(startingCamera.x, startingCamera.y)
      .scale(startingCamera.k);
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
        transform,
        dark,
        changes,
        selected: actions.current.selected,
        hovered: hovering,
      };
      items = visibleItems(layout.root, {
        left: unprojectColumn(-transform.x / transform.k, columns),
        right: unprojectColumn((width - transform.x) / transform.k, columns),
        top: -transform.y / (sy * transform.k),
        bottom: (height - transform.y) / (sy * transform.k),
        pixelsPerLine: sy * transform.k,
      });
      paint(ctx, items, options);
      paintMini();
      setStats({ drawn: items.length, scale: transform.k });
      const metrics = (
        window as unknown as {
          __mutrixMetrics: { firstPaint?: number; frames: number[]; drawn: number };
        }
      ).__mutrixMetrics;
      metrics.firstPaint ??= performance.now();
      metrics.frames.push(performance.now() - started);
      if (metrics.frames.length > 600) metrics.frames.shift();
      metrics.drawn = items.length;
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
        right: layout.width,
        top: 0,
        bottom: layout.total,
        pixelsPerLine: mh / (layout.total || 1),
      });
      paint(context, overview, {
        width: mw,
        height: mh,
        columns: miniatureColumns(columns, mw),
        lineScale: mh / (layout.total || 1),
        transform: zoomIdentity,
        dark,
        changes,
      });
      const x = (-transform.x / transform.k / columns.width) * mw;
      const y = (-transform.y / (sy * transform.k) / (layout.total || 1)) * mh;
      context.strokeStyle = dark ? "#f5f5f5" : "#262626";
      context.lineWidth = 1.5;
      context.strokeRect(
        Math.max(0, x),
        Math.max(0, y),
        Math.min(mw, (width / transform.k / columns.width) * mw),
        Math.min(mh, (height / (sy * transform.k) / (layout.total || 1)) * mh),
      );
    };
    const behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 20000])
      .filter((event) => !event.button && (event.type !== "wheel" || !event.shiftKey))
      .on("zoom", (event) => {
        transform = event.transform;
        lastCamera.current = { x: transform.x, y: transform.y, k: transform.k };
        actions.current.onCameraChange(lastCamera.current);
        schedule();
        setTooltip(undefined);
      });
    const selection = select(element).call(behavior);
    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      sy = height / (layout.total || 1);
      columns = fitColumns(layout.width, width);
      behavior
        .extent([
          [0, 0],
          [width, height],
        ])
        .translateExtent([
          [0, 0],
          [Math.max(width, columns.width), height],
        ]);
      schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    // Restore the navigation snapshot after the viewport geometry is known.
    selection.call(
      behavior.transform,
      behavior.constrain()(
        transform,
        [
          [0, 0],
          [width, height],
        ],
        [
          [0, 0],
          [Math.max(width, columns.width), height],
        ],
      ),
    );
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
          y: Math.min(event.clientY - rect.top + 14, height - 95),
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
        const targetScale = Math.min(20000, height / Math.max(1, (item.x1 - item.x0) * sy));
        selection.call(
          behavior.transform,
          zoomIdentity
            .translate(-projectColumn(item.y0, columns) * targetScale, -item.x0 * sy * targetScale)
            .scale(targetScale),
        );
      } else if (item) actions.current.onFocus(item.nodes[0].data.node.id);
    };
    const leave = () => {
      setTooltip(undefined);
      hovering = undefined;
      schedule();
    };
    const wheel = (event: WheelEvent) => {
      if (event.shiftKey) {
        event.preventDefault();
        selection.call(behavior.translateBy, -event.deltaY / transform.k, 0);
      }
    };
    selection.on("dblclick.zoom", null);
    element.addEventListener("mousemove", move);
    element.addEventListener("click", click);
    element.addEventListener("dblclick", doubleClick);
    element.addEventListener("mouseleave", leave);
    element.addEventListener("wheel", wheel, { passive: false });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") selection.call(behavior.scaleBy, 1.5);
      else if (event.key === "-") selection.call(behavior.scaleBy, 1 / 1.5);
      else if (event.key === "Home") selection.call(behavior.transform, zoomIdentity);
    };
    element.addEventListener("keydown", onKey);
    api.current = {
      scale: (factor) => selection.call(behavior.scaleBy, factor),
      reset: () => selection.call(behavior.transform, zoomIdentity),
      move: (event) => {
        const rect = mini.current!.getBoundingClientRect();
        const x =
          Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * columns.width;
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * height;
        selection.call(behavior.translateTo, x, y);
      },
    };
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      selection.on(".zoom", null);
      element.removeEventListener("mousemove", move);
      element.removeEventListener("click", click);
      element.removeEventListener("dblclick", doubleClick);
      element.removeEventListener("mouseleave", leave);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", onKey);
      api.current = null;
    };
  }, [layout, dark, changes, initialCamera]);
  useEffect(() => {
    // Redraw selection through the existing zoom behavior without rebuilding the layout.
    if (canvas.current) canvas.current.dispatchEvent(new MouseEvent("mouseleave"));
  }, [selected]);
  return (
    <div className="matrix-region">
      <div className="axis-label">
        {changes ? "비교 표시 LOC" : "CURRENT LOC"}
        <span>↑ {format(layout?.total ?? 0)}</span>
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
            </strong>
            <span>
              {tooltip.count > 1
                ? "더블클릭으로 집계 영역 확대"
                : tooltip.node.path || "Project root"}
            </span>
            {tooltip.count === 1 && (
              <span>
                {format(tooltip.node.afterLoc)} LOC{" "}
                {changes &&
                  `· ${signed(tooltip.node.delta)} · +${tooltip.node.added} / −${tooltip.node.removed}`}
              </span>
            )}
          </div>
        )}
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
          <span>{stats.scale.toFixed(1)}×</span>
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
        </div>
        {layout && layout.total > 0 && (
          <button
            className="minimap"
            aria-label="Move chart viewport"
            onClick={(event) => api.current?.move(event)}
          >
            <canvas width={126} height={78} ref={mini} />
            <span>OVERVIEW</span>
          </button>
        )}
      </div>
      <div className="matrix-caption">
        <span>
          계층 깊이 → <b>PROJECT / FOLDER / FILE / SCOPE</b>
        </span>
        <span>{format(stats.drawn)} drawn · LOD auto</span>
      </div>
    </div>
  );
}
