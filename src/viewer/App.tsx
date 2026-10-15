import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileUp,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Info,
  X,
  Check,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { Report } from "../shared/types";
import { attachDocument, parseSummaries } from "../shared/summaries";
import { projectPlan } from "../shared/plans";
import { buildLayout, parentChain, reportIndex, type Filters } from "./chart/layout";
import { MatrixChart } from "./chart/MatrixChart";
import { identityCamera, type ChartCamera } from "./chart/camera";
import { Explorer } from "./components/Explorer";
import { Inspector } from "./components/Inspector";
import { DiagnosticsDialog } from "./components/DiagnosticsDialog";
import { Button } from "./components/ui/button";
import { editorUri } from "./lib/node-links";
import { DEFAULT_WARN_LOC } from "./chart/labels";

interface ViewSnapshot {
  focus: string;
  selected: string;
  camera: ChartCamera;
  filters: Filters;
  mode: "structure" | "changes" | "plan";
}

export function App({ initialReport }: { initialReport: Report }) {
  const [report, setReport] = useState(initialReport);
  const [selected, setSelected] = useState(report.rootId);
  const [focus, setFocus] = useState(report.rootId);
  const [history, setHistory] = useState<ViewSnapshot[]>([]);
  const currentCamera = useRef<ChartCamera>(identityCamera());
  const [initialCamera, setInitialCamera] = useState<ChartCamera>(currentCamera.current);
  const [mode, setMode] = useState<ViewSnapshot["mode"]>(report.plan ? "plan" : report.meta.mode);
  const changes = mode !== "structure";
  const displayReport = useMemo(
    () =>
      mode === "plan" && report.plan
        ? { ...report, nodes: projectPlan(report, report.plan).nodes }
        : report,
    [report, mode],
  );
  const [warnLoc, setWarnLoc] = useState(DEFAULT_WARN_LOC);
  const [filters, setFilters] = useState<Filters>({ changed: false, extension: "", sort: "path" });
  const [left, setLeft] = useState(() => window.innerWidth > 600),
    [right, setRight] = useState(() => window.innerWidth > 900);
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const themeOverride = useRef(false);
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  const summaryInput = useRef<HTMLInputElement>(null);
  const index = useMemo(() => reportIndex(displayReport), [displayReport]);
  const layout = useMemo(
    () => buildLayout(index, focus, filters, !changes),
    [index, focus, filters, changes],
  );
  const chain = useMemo(() => parentChain(index, focus), [index, focus]);
  const node = index.get(selected) ?? index.get(report.rootId)!;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      if (!themeOverride.current) setDark(media.matches);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);
  const focusNode = (id: string) => {
    if (id !== focus) {
      setHistory((previous) => [
        ...previous,
        { focus, selected, camera: { ...currentCamera.current }, filters: { ...filters }, mode },
      ]);
      setFocus(id);
    }
    setInitialCamera(identityCamera());
    setSelected(id);
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFocus(previous.focus);
    setSelected(previous.selected);
    setFilters(previous.filters);
    setMode(previous.mode);
    setInitialCamera({ ...previous.camera });
    setHistory(history.slice(0, -1));
  };
  const toggleFocusNode = (id: string) => {
    const target = index.get(id)!;
    if (target.kind === "file") {
      const uri = editorUri(report.meta.rootPath, target);
      if (uri) {
        const link = document.createElement("a");
        link.href = uri;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      } else setNotice("삭제되었거나 아직 생성하지 않은 파일은 열 수 없습니다.");
      return;
    }
    if (id === focus && history.length) goBack();
    else focusNode(id);
  };
  const changeMode = (next: ViewSnapshot["mode"]) => {
    setMode(next);
    setFocus(report.rootId);
    setSelected(report.rootId);
    setHistory([]);
    setFilters({ ...filters, changed: false });
    setInitialCamera(identityCamera());
  };
  const importSummaries = async (file?: File) => {
    if (!file) return;
    try {
      const doc = parseSummaries(JSON.parse(await file.text()));
      const next = { ...report, nodes: report.nodes.map((node) => ({ ...node })) };
      const addedDiagnostics = attachDocument(next, doc);
      setReport({ ...next, diagnostics: [...report.diagnostics, ...addedDiagnostics] });
      if (next.plan !== report.plan) changeMode("plan");
      setNotice(
        `${doc.entries.length}개 ${doc.mode === "plan" || doc.entries.some((entry) => entry.plan || entry.create) ? "계획 항목" : "설명"}을 불러왔습니다.${addedDiagnostics.length ? ` ${addedDiagnostics.length}개 진단을 확인하세요.` : ""}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
    if (summaryInput.current) summaryInput.current.value = "";
  };
  return (
    <div className="app-shell">
      <header className="workspace-toolbar" aria-label="Workspace toolbar">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle explorer"
          title="Toggle explorer"
          onClick={() => {
            setLeft(!left);
            if (!left && window.innerWidth <= 900) setRight(false);
          }}
        >
          {left ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            focusNode(report.rootId);
          }}
        >
          mutrix
        </a>
        <div className="project-context" title={report.meta.rootPath}>
          <span className="project-label">{report.meta.name}</span>
          {report.meta.branch && <span className="branch-label">{report.meta.branch}</span>}
          {mode === "plan" ? (
            <span className="comparison-base">현재 스냅샷 → 계획 · 추정</span>
          ) : (
            report.meta.mode === "changes" && (
              <span className="comparison-base" aria-label="Comparison base">
                {report.meta.baseRef}@{report.meta.baseCommit?.slice(0, 7)} → 작업 폴더
              </span>
            )
          )}
        </div>
        <div className="mode-switch">
          <button
            className={mode === "structure" ? "active" : ""}
            onClick={() => changeMode("structure")}
          >
            Structure
          </button>
          <button
            disabled={report.meta.mode !== "changes"}
            className={mode === "changes" ? "active" : ""}
            onClick={() => changeMode("changes")}
          >
            Changes
          </button>
          <button
            disabled={!report.plan}
            className={mode === "plan" ? "active" : ""}
            onClick={() => changeMode("plan")}
            title="계획 JSON을 불러오면 사용할 수 있습니다"
          >
            Plan
          </button>
        </div>
        {changes && (
          <div className={`chart-legend ${mode === "plan" ? "plan-legend" : ""}`}>
            <span>
              <i className="legend-increase" />
              {mode === "plan" ? "예정 추가" : "증가"}
            </span>
            <span>
              <i className="legend-decrease" />
              {mode === "plan" ? "예정 삭제" : "감소"}
            </span>
            <span>
              <i className="legend-modified" />
              {mode === "plan" ? "설명 / 동일 LOC 계획" : "동일 LOC 수정"}
            </span>
            <span>
              <i className="legend-unchanged" />
              변경 없음
            </span>
          </div>
        )}
        <div className="header-actions">
          <input
            ref={summaryInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => importSummaries(e.target.files?.[0])}
          />
          <Button
            className="summary-import"
            variant="ghost"
            size="sm"
            aria-label="Summary / 계획 불러오기"
            title="Summary / 계획 불러오기"
            onClick={() => summaryInput.current?.click()}
          >
            <FileUp />
            <span className="summary-label">Summary / 계획 불러오기</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Toggle theme"
            aria-label="Toggle theme"
            onClick={() => {
              themeOverride.current = true;
              setDark(!dark);
            }}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle inspector"
            title="Toggle inspector"
            onClick={() => {
              setRight(!right);
              if (!right && window.innerWidth <= 600) setLeft(false);
            }}
          >
            {right ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </div>
      </header>
      <main className={`workspace ${!left ? "no-explorer" : ""} ${!right ? "no-inspector" : ""}`}>
        {left && (
          <Explorer
            warnLoc={warnLoc}
            nodes={displayReport.nodes}
            index={index}
            rootId={report.rootId}
            selected={selected}
            changes={changes}
            onSelect={setSelected}
            onFocus={toggleFocusNode}
            filters={filters}
            onFilters={setFilters}
          />
        )}
        <section className="chart-workspace">
          <div className="chart-breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Go back"
              title="Go back"
              disabled={!history.length}
              onClick={goBack}
            >
              <ArrowLeft />
            </Button>
            <nav aria-label="Chart breadcrumb">
              {chain.map((part, i) => (
                <span key={part.id}>
                  {i > 0 && <ChevronRight size={12} />}
                  <button onClick={() => focusNode(part.id)}>{part.name}</button>
                </span>
              ))}
            </nav>
            <span className="scope-badge" title="현재 표시 범위">
              {filters.changed || filters.extension || focus !== report.rootId
                ? "부분 보기"
                : "전체"}
              {filters.changed && " · 변경만"} {filters.extension && ` · ${filters.extension}`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => focusNode(report.rootId)}>
              전체 보기
            </Button>
          </div>
          <MatrixChart
            warnLoc={warnLoc}
            onWarnLoc={setWarnLoc}
            layout={layout}
            dark={dark}
            changes={changes}
            selected={selected}
            onSelect={setSelected}
            onFocus={toggleFocusNode}
            initialCamera={initialCamera}
            onCameraChange={(camera) => {
              currentCamera.current = camera;
            }}
          />
        </section>
        {right && (
          <Inspector
            warnLoc={warnLoc}
            node={node}
            rootPath={report.meta.rootPath}
            changes={changes}
            onFocus={focusNode}
            onSelect={setSelected}
            notify={setNotice}
          />
        )}
      </main>
      <footer className="status-bar">
        <span>
          <i />
          오프라인 스냅샷 <b>·</b> {new Date(report.meta.generatedAt).toLocaleString("ko-KR")}
        </span>
        <button onClick={() => setDiagnostics(true)}>
          <Info size={12} />
          {report.diagnostics.length} diagnostics
        </button>
        <span>Mutrix · read-only analysis</span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <DiagnosticsDialog report={report} open={diagnostics} onClose={() => setDiagnostics(false)} />
    </div>
  );
}
