---
name: mutrix-pr-review
description: Mutrix로 PR·로컬 변경을 검토하거나 현재 코드 구조 위에 구현 전 변경 규모·함수 계약을 제안하는 오프라인 HTML 보고서를 만든다. 변경 결과 시각화, Summary 작성, Mutrix를 이용한 계획 제안 요청에 사용한다.
---

# Mutrix로 변경 검토와 계획 제안

코드 변경의 위치·크기·계층을 Mutrix로 확인하고, 실제 diff에 근거한 설명을 붙인 HTML과 JSON을 제공한다. LOC 증감만으로 코드 품질이나 리팩토링 필요성을 판정하지 않는다.

구현 전 계획 요청에는 [references/planning.md](references/planning.md)를 읽고 현재 스냅샷에 예상 순증감·새 노드·함수 계약을 제안한다. 기존 스킬 이름 `$mutrix-pr-review`로 두 흐름을 모두 사용할 수 있다. 아래 절차는 구현 후 실제 변경 검토에 적용한다. 계획 보고서 생성은 소스 수정·Git 변경·원격 게시를 추가로 허가하지 않는다.

## 비교 대상 확보

- 사용자가 준 PR URL/번호, 로컬 브랜치, 기준 ref를 우선한다. PR이면 사용 가능한 GitHub 도구 또는 `gh pr view <PR> --json url,baseRefName,baseRefOid,headRefName,headRefOid`로 대상 저장소·기준·최신 head SHA를 확인한다. 도구가 없으면 로컬 비교를 진행하되 원격 PR과 일치 여부는 확인되지 않았다고 표시한다.
- `git rev-parse --show-toplevel`, `git rev-parse HEAD`, `git status --porcelain`로 분석 경로와 상태를 확인한다. 원격 PR 결과로 제공하려면 PR head와 HEAD가 같고 작업 폴더가 깨끗해야 한다. 다르면 기존 체크아웃을 덮어쓰지 않고 사용자에게 허용된 별도 worktree/체크아웃을 사용한다. PR ref를 얻기 위한 fetch가 필요하면 필요한 ref만 가져온다.
- 로컬 작업 결과를 요청했다면 미커밋·스테이징·신규 파일도 포함한다. 원격 PR과 다른 내용이 섞이면 결과를 작업 폴더 스냅샷이라고 명시한다. 현재 브랜치·인덱스·소스를 바꾸거나 commit/push/PR 댓글을 작성하는 권한은 이 스킬로 추가되지 않는다.
- `--base`에는 PR의 실제 기준 ref 또는 사용자가 지정한 ref를 사용한다. 원격 PR이면 ref가 `baseRefOid`와 일치하는지 확인하고, 정확한 재현이 필요하면 그 SHA를 기준으로 지정한다. 존재하는지 확인하고 임의로 main/master를 대입하지 않는다. Mutrix는 그 ref와 HEAD의 **merge-base → 현재 작업 폴더**를 비교하며 자동 fetch는 하지 않는다. 기준 브랜치에서 실행하면 구조 모드가 된다. PR 비교가 필요하면 head의 별도 체크아웃을 사용한다.

## 분석 보고서 생성

Mutrix 실행 파일의 경로는 사용자가 준 경로, PATH의 `mutrix`/`mutrix.exe`, Mutrix 레포의 `dist/mutrix.exe` 순으로 확인한다. 실행 파일이 없고 Mutrix 소스와 Bun이 있으면 Mutrix 레포에서 `bun install --frozen-lockfile`과 `bun run build`로 만든다. 검토 대상 레포를 Mutrix 소스 레포로 오인하지 않는다.

HTML·JSON·Summary는 소스와 다른 출력 경로에 둔다. 아래는 분석할 레포 루트에서 실행하는 PowerShell 예시다. `mutrix.exe`와 `origin/main`을 확인한 실제 실행 파일 경로·기준 ref로 바꾸고, 새 출력 파일만 사용한다.

```powershell
mutrix.exe . --base origin/main `
  --output .mutrix/pr-report.html `
  --json .mutrix/pr-report.json `
  --exclude ".mutrix/**"
```

매 실행의 종료 코드를 확인한다. `schemaVersion: 1`, `meta.mode: "changes"`, `meta.headCommit`, `meta.baseCommit`, `diagnostics`를 검사해 요청한 비교인지 확인한다. 구조 모드나 분석 실패를 PR 변경 보고서로 제시하지 않는다. `baseCommit`은 기준 브랜치 tip이 아니라 merge-base다. 결과 파일은 추적되거나 기존 분석에 포함되지 않게 한다.

## 변경 내용 검토와 Summary

- JSON의 `kind: "file"`이며 `status !== "unchanged"`인 노드로 파일 목록을 만들고, `added + removed`와 경로별 집중도를 검토한다. 폴더·파일·자식 스코프의 수치는 중첩되므로 모두 더해 전체 변경량으로 계산하지 않는다. 전체 수치는 `rootId` 노드를 사용한다.
- `git diff --no-ext-diff <meta.baseCommit> -- <path>`와 현재 소스를 확인한다. 신규 파일은 Git diff에 안 나올 수 있으므로 직접 읽고, 삭제 파일은 `git show <meta.baseCommit>:<path>`에서 확인한다. `beforeRange`/`afterRange`는 원본 범위이며 소유 LOC와 다를 수 있다.
- JS/TS 계열은 심볼까지 분석되고 다른 텍스트는 파일 단위다. `기타 코드`는 import·타입 선언 등 독립 심볼에 포함되지 않은 영역이다. 이름·부모가 바뀐 심볼은 추가/삭제로 표시될 수 있으므로 rename 관계와 diff를 함께 확인한다.
- 순증감 0인 수정도 확인한다. 증가율은 기존 LOC 대비 비율이고 새 노드는 `+∞`, 삭제는 잔존 `0%`다. 변경 차트 높이 `weight`는 말단별 전후 큰 값을 합한 표시 크기이므로 실제 LOC와 다를 수 있다.
- 실제 diff에서 확인한 목적·동작 변화·주의점을 중요한 파일이나 심볼에 짧게 작성한다. 테스트 통과나 개선 효과를 확인 없이 단정하지 않는다. 진단에 파싱 실패·제외 파일이 있으면 검토 한계를 결과에 적는다.

Summary는 보고서에 존재하는 `id`를 그대로 복사해 아래 계약으로 작성한다. ID를 이름이나 줄 번호로 추측하지 않는다. 동일 ID는 한 번만 넣고 설명은 일반 텍스트로 작성한다.

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "nodeId": "file:src/parser.ts",
      "summary": "파싱 단계와 입력 검증을 분리했습니다."
    }
  ]
}
```

`.mutrix/pr-summaries.json`에 작성하고 동일 경로·기준·제외 규칙으로 재생성한다.

```powershell
mutrix.exe . --base origin/main `
  --output .mutrix/pr-report.html `
  --json .mutrix/pr-report.json `
  --summaries .mutrix/pr-summaries.json `
  --exclude ".mutrix/**"
```

재생성 후 head/base SHA와 노드별 수치가 첫 분석과 동일한지 확인하고 Summary의 모르는 ID·중복 ID 진단을 해결한다. 검토 중 코드가 바뀌었다면 다시 분석하고 설명을 재확인한다. 브라우저에서 Summary JSON을 불러오는 방법은 세션에만 적용되므로 공유할 HTML에는 `--summaries`로 내장한다.

## 결과 제공

HTML·JSON·Summary 파일 링크와 분석한 PR/head SHA·기준 ref·merge-base·작업 폴더 변경 포함 여부를 남긴다. 주요 변경 영역과 실제로 확인한 동작, 수행한 테스트, 분석 진단의 한계를 간결하게 설명한다. HTML은 외부 서버 없이 동작하며 더블클릭으로 하위 영역을 탐색하고 같은 영역을 다시 더블클릭하면 직전 화면으로 돌아간다. 보고서에는 소스 본문이 포함되지 않는다.
