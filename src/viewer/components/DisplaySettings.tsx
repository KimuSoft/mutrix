import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { ControlPopover } from "./ui/control-popover";
import { DEFAULT_WARN_LOC } from "../chart/labels";

export function DisplaySettings({
  warnLoc,
  onWarnLoc,
}: {
  warnLoc: number;
  onWarnLoc: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(warnLoc));
  useEffect(() => setDraft(String(warnLoc)), [warnLoc]);
  const apply = () => {
    const value = Number(draft);
    if (Number.isSafeInteger(value) && value > 0) onWarnLoc(value);
    else setDraft(String(warnLoc));
  };
  return (
    <ControlPopover
      label="표시 설정"
      contentLabel="차트 표시 설정"
      trigger={<Settings2 />}
      className="display-settings"
    >
      <strong>표시 설정</strong>
      <label htmlFor="warn-loc">WARN 기준 LOC</label>
      <div className="warn-setting-row">
        <input
          id="warn-loc"
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          onClick={() => {
            setDraft(String(DEFAULT_WARN_LOC));
            onWarnLoc(DEFAULT_WARN_LOC);
          }}
        >
          초기화
        </button>
      </div>
      <p>파일·심볼의 현재 LOC가 기준을 초과하면 WARN을 표시합니다. 이 보고서 세션에 적용됩니다.</p>
    </ControlPopover>
  );
}
