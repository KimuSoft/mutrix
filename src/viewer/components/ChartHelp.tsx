import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "./ui/button";

export function ChartHelp() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="chart-guide" ref={host}>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        aria-label="차트 사용법"
        title="차트 사용법"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <CircleHelp />
      </Button>
      {open && (
        <div id={id} className="chart-guide-panel" role="dialog" aria-label="차트 사용법 안내">
          <strong>차트 사용법</strong>
          <dl>
            <dt>클릭</dt>
            <dd>노드 상세 보기</dd>
            <dt>더블클릭</dt>
            <dd>하위 영역 보기 · 같은 영역은 뒤로가기</dd>
            <dt>드래그</dt>
            <dd>이동</dd>
            <dt>스크롤 / 핀치</dt>
            <dd>확대·축소</dd>
            <dt>Shift + 스크롤</dt>
            <dd>가로 이동</dd>
            <dt>+ / − / Home</dt>
            <dd>차트에서 확대·축소·초기화</dd>
          </dl>
          <p>
            세로는 LOC, 오른쪽은 더 깊은 계층입니다. 변경 모드는 삭제 영역도 표시하므로 차트 높이가
            현재 LOC보다 클 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
