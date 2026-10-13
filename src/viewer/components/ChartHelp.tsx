import { CircleHelp } from "lucide-react";
import { ControlPopover } from "./ui/control-popover";

export function ChartHelp() {
  return (
    <ControlPopover label="차트 사용법" contentLabel="차트 사용법 안내" trigger={<CircleHelp />}>
      <strong>차트 사용법</strong>
      <dl>
        <dt>클릭</dt>
        <dd>노드 상세 보기</dd>
        <dt>더블클릭</dt>
        <dd>하위 영역 보기 · 같은 영역은 뒤로가기</dd>
        <dt>드래그</dt>
        <dd>이동</dd>
        <dt>스크롤 / 핀치</dt>
        <dd>선택한 축 확대·축소</dd>
        <dt>배율 버튼</dt>
        <dd>함께 · 가로 · 세로 선택과 배율 조정</dd>
        <dt>함께 확대</dt>
        <dd>가로는 1.5배까지 · 이후 세로만 확대</dd>
        <dt>Shift + 스크롤</dt>
        <dd>가로 이동</dd>
        <dt>+ / − / Home</dt>
        <dd>차트에서 확대·축소·초기화</dd>
      </dl>
      <p>
        세로는 LOC, 오른쪽은 더 깊은 계층입니다. 변경 모드는 삭제 영역도 표시하므로 차트 높이가 현재
        LOC보다 클 수 있습니다.
      </p>
    </ControlPopover>
  );
}
