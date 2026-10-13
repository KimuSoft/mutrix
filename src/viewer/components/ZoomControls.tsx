import { Minus, Plus } from "lucide-react";
import { MIN_SCALE, MAX_SCALE, type ChartCamera, type ZoomAxis } from "../chart/camera";
import { Button } from "./ui/button";
import { ControlPopover } from "./ui/control-popover";

const axes = [
  { value: "both", label: "함께" },
  { value: "x", label: "가로" },
  { value: "y", label: "세로" },
] as const;
export function ZoomControls({
  camera,
  axis,
  onAxis,
  onZoom,
}: {
  camera: ChartCamera;
  axis: ZoomAxis;
  onAxis: (axis: ZoomAxis) => void;
  onZoom: (factor: number, axis: ZoomAxis) => void;
}) {
  const display =
    camera.kx === camera.ky
      ? `${axis === "x" ? "↔ " : axis === "y" ? "↕ " : ""}${camera.kx.toFixed(1)}×`
      : `↔ ${camera.kx.toFixed(1)}  ↕ ${camera.ky.toFixed(1)}`;
  return (
    <ControlPopover
      label="배율 조정"
      contentLabel="가로·세로 배율"
      trigger={display}
      className="zoom-panel"
      triggerClassName="zoom-trigger"
    >
      <strong>확대 축</strong>
      <div className="zoom-axis-options" role="radiogroup" aria-label="확대 축">
        {axes.map((choice, i) => (
          <button
            key={choice.value}
            role="radio"
            aria-checked={axis === choice.value}
            tabIndex={axis === choice.value ? 0 : -1}
            onClick={() => onAxis(choice.value)}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!offset) return;
              event.preventDefault();
              const next = (i + offset + axes.length) % axes.length;
              onAxis(axes[next].value);
              event.currentTarget
                .parentElement!.querySelectorAll<HTMLButtonElement>("button")
                [next].focus();
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {axes.slice(1).map(({ value, label }) => {
        const scale = value === "x" ? camera.kx : camera.ky;
        return (
          <div className="zoom-axis-row" key={value}>
            <label>{label}</label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${label} 축소`}
              disabled={scale <= MIN_SCALE}
              onClick={() => onZoom(1 / 1.5, value)}
            >
              <Minus />
            </Button>
            <output aria-label={`${label} 배율`}>{scale.toFixed(1)}×</output>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${label} 확대`}
              disabled={scale >= MAX_SCALE}
              onClick={() => onZoom(1.5, value)}
            >
              <Plus />
            </Button>
          </div>
        );
      })}
      <p>
        휠·핀치와 +/− 버튼은 선택한 축에 적용됩니다. 함께 확대는 가로 1.5배부터 세로만 확대합니다.
      </p>
    </ControlPopover>
  );
}
