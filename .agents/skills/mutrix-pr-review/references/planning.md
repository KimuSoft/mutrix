# Mutrix로 구현 전 계획 제안

현재 코드 구조 위에 AI가 제안하는 변경 위치·예상 규모·함수 계약을 표시한다. 코드를 먼저 수정할 필요가 없으며, 실제 diff 설명과 예정 변경을 구분한다. 이 흐름은 요청된 계획을 시각화할 때 사용한다. 모든 PR이나 일반 계획 작업에 자동으로 보고서 생성을 추가하지 않는다.

## 현재 스냅샷 확보

실행 파일은 사용자 지정 경로, PATH의 `mutrix`/`mutrix.exe`, Mutrix 레포의 `dist/mutrix.exe` 순으로 찾는다. 계획 기능을 포함한 최신 빌드가 필요하다. 소스에서 빌드할 때는 분석 대상과 Mutrix 소스 레포를 구분한다.

Git 루트·현재 브랜치·HEAD와 작업 폴더 상태를 확인하고 JSON을 생성한다. 미커밋·신규 파일도 현재 상태에 포함한다. 다음 명령은 분석할 프로젝트 루트의 PowerShell 예시이며 실행 파일 경로를 실제 설치 위치로 바꾼다.

```powershell
mutrix.exe . --output .mutrix/snapshot.html --json .mutrix/snapshot.json --exclude ".mutrix/**"
```

종료 코드·진단을 확인한다. `meta.mode`가 structure와 changes 중 어느 쪽이어도 계획을 제안할 수 있다. 계획의 기준 LOC는 항상 현재 스냅샷의 `afterLoc`이며 Git merge-base의 `beforeLoc`가 아니다. 현재 존재하는 파일·스코프 ID를 JSON에서 그대로 복사하고, 대상 소스를 읽어 책임과 계약을 확인한다. `status: "deleted"`인 과거 노드를 현재 대상으로 사용하지 않는다.

## 계획 JSON 작성

`.mutrix/plan.json`에 `schemaVersion: 1`, `mode: "plan"`, `entries`를 작성한다. 각 항목은 `nodeId`와 일반 텍스트 `summary`를 가진다. Summary에는 제안 이유·예상 동작을 적고 이미 구현되었다고 표현하지 않는다.

- `plan.delta` 하나로 예상 순증감을 지정한다. `30`은 약 30줄 증가, `-30`은 약 30줄 감소다. JSON 양수에는 `+`를 쓰지 않는다. 추가·삭제량을 별도 필드로 나누지 않는다. 현재 LOC 대비 비율로 양수는 파랑, 음수는 오렌지로 표시하며 0은 중립색이다.
- 규모를 아직 모르면 `delta`를 생략한다. 기존 높이를 유지하며, 새 0 LOC 노드는 트리·검색에서 접근한다. 숫자는 계획자의 추정치이고 실제 diff나 품질 점수가 아니다. 현재 LOC를 초과하는 감소량이나 소수는 지정하지 않는다.
- 기존 노드에는 보고서의 ID를 사용한다. 새 노드는 고유한 ID(`plan:` 접두사 권장)와 `create`를 지정한다. `kind`는 `folder`, `file`, `scope`다. 폴더·파일의 부모는 프로젝트/폴더, 스코프의 부모는 파일/스코프다.
- 새 폴더·파일의 `path`는 부모 경로에 `name`을 붙인 `/` 구분 상대 경로다. 새 스코프는 부모와 같은 파일 경로를 쓴다. 같은 문서의 새 부모를 참조할 수 있으며 선언 순서는 자유다. 기존 경로를 다른 ID의 새 파일로 중복 생성하지 않는다.
- 추정치는 중복 없는 계층에 둔다. 파일 전체와 그 내부 함수 양쪽에 `delta`를 지정하지 않는다. 전체 노드 추정치는 하위 심볼을 접어 표시하며 조상·자손 항목이 겹치면 조상 추정치를 건너뛰고 진단한다. 새 파일 안에 함수별 분량을 제안할 때 파일의 `delta`는 생략한다.

다음 경로·기존 ID는 설명용이다. 실제 스냅샷에서 확인한 ID와 구현할 경로로 바꾼다.

```json
{
  "schemaVersion": 1,
  "mode": "plan",
  "entries": [
    {
      "nodeId": "file:src/parser.ts",
      "summary": "검증 로직을 별도 모듈로 옮겨 파서의 책임을 줄입니다.",
      "plan": { "delta": -30 }
    },
    {
      "nodeId": "plan:validation-file",
      "summary": "검증 함수를 담을 새 모듈입니다. 분량은 하위 함수에 지정합니다.",
      "create": {
        "parentId": "folder:src",
        "kind": "file",
        "name": "validation.ts",
        "path": "src/validation.ts"
      }
    },
    {
      "nodeId": "plan:validate",
      "summary": "텍스트와 검증 옵션을 받아 검증된 문자열을 반환하도록 제안합니다.",
      "create": {
        "parentId": "plan:validation-file",
        "kind": "scope",
        "name": "validate",
        "path": "src/validation.ts"
      },
      "plan": {
        "delta": 60,
        "signature": {
          "parameters": [
            { "name": "text", "type": "string" },
            { "name": "options", "type": "ValidationOptions", "optional": true }
          ],
          "returnType": "string"
        }
      }
    }
  ]
}
```

`plan.signature`는 현재 함수 스코프 또는 새 스코프에 인자·반환 타입 계약을 제안한다. 각 인자는 `name`, `type`을 가지며 `optional`, `rest`는 선택적 boolean으로 기본 false다. 인자가 없으면 `parameters: []`를 쓰고 `returnType`은 생략하지 않는다. 일반 파일·폴더·클래스에는 함수 계약을 붙이지 않는다. `delta` 없이 계약만 제안해도 된다. 노드에 **제안 계약**, 타입 배지, 반환 타입 앞 디바이더가 표시되며 작은 영역에서는 확대가 필요하다. 원본 시그니처를 수정하거나 제안 타입을 실제로 검증하지는 않는다.

## 내장 보고서 생성과 확인

첫 분석과 같은 경로·제외 규칙으로 생성한다. 사용자가 `--base`를 지정했다면 두 실행에 같은 값을 사용한다.

```powershell
mutrix.exe . --output .mutrix/plan.html --json .mutrix/planned.json --summaries .mutrix/plan.json --exclude ".mutrix/**"
```

종료 코드와 진단을 확인하고 다음을 검증한다.

- `planned.json.plan`에 계획 문서가 저장되어야 한다. 누락되면 구버전 실행 파일일 수 있으므로 계획 보고서 생성 성공으로 처리하지 않고 최신 빌드를 확보한다.
- 첫 분석과 head/base 및 원본 `nodes` 수치가 같아야 한다. 계획은 별도 `plan`에 저장되며 원본 LOC와 실제 변경 Summary를 덮어쓰지 않는다. 분석 중 소스가 바뀌었으면 스냅샷과 추정치를 다시 확인한다.
- 모르는 ID·중복 ID·잘못된 부모나 경로·초과 감소량·겹치는 추정치·잘못된 함수 대상 진단을 해결한다. 예상 LOC는 `현재 + delta`이며 부모는 자식에서 집계한다. 자손과 부모를 모두 더하지 않는다. 삭제 영역의 비교 높이는 남으므로 차트 높이가 예상 LOC와 다를 수 있다.

보고서는 Plan 보기로 시작한다. 화면의 Summary / 계획 불러오기도 같은 JSON을 받지만 세션에만 적용되므로 공유용 HTML에는 CLI로 내장한다. 계획을 다시 불러오면 이전 계획을 교체한다.

HTML·계획 JSON·보고서 JSON 링크, 기준 브랜치/HEAD·스냅샷 시점과 미커밋 포함 여부, 주요 제안과 추정 근거를 제공한다. 실제 구현·검증 결과로 표현하지 않는다. 코드가 바뀌면 계획을 재검토하고 새 스냅샷으로 보고서를 만든다. 사용자가 계획의 구현도 요청한 경우에는 구현한 결과를 별도의 변경 검토 흐름으로 확인할 수 있다.
