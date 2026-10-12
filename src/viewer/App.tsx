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
import { attachSummaries, parseSummaries } from "../shared/summaries";
import { buildLayout, parentChain, reportIndex, type Filters } from "./chart/layout";
import { MatrixChart, type ChartCamera } from "./chart/MatrixChart";
import { Explorer } from "./components/Explorer";
import { Inspector } from "./components/Inspector";
import { DiagnosticsDialog } from "./components/DiagnosticsDialog";
import { Button } from "./components/ui/button";
import { format } from "./lib/utils";

interface ViewSnapshot {
  focus: string;
  selected: string;
  camera: ChartCamera;
  filters: Filters;
  changes: boolean;
}

export function App({ initialReport }: { initialReport: Report }) {
  const [report, setReport] = useState(initialReport);
  const [selected, setSelected] = useState(report.rootId);
  const [focus, setFocus] = useState(report.rootId);
  const [history, setHistory] = useState<ViewSnapshot[]>([]);
  const currentCamera = useRef<ChartCamera>({ x: 0, y: 0, k: 1 });
  const [initialCamera, setInitialCamera] = useState<ChartCamera>(currentCamera.current);
  const [changes, setChanges] = useState(report.meta.mode === "changes");
  const [filters, setFilters] = useState<Filters>({ changed: false, extension: "", sort: "path" });
  const [left, setLeft] = useState(() => window.innerWidth > 600),
    [right, setRight] = useState(() => window.innerWidth > 900);
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const themeOverride = useRef(false);
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  const summaryInput = useRef<HTMLInputElement>(null);
  const index = useMemo(() => reportIndex(report), [report]);
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
        { focus, selected, camera: { ...currentCamera.current }, filters: { ...filters }, changes },
      ]);
      setFocus(id);
    }
    setInitialCamera({ x: 0, y: 0, k: 1 });
    setSelected(id);
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFocus(previous.focus);
    setSelected(previous.selected);
    setFilters(previous.filters);
    setChanges(previous.changes);
    setInitialCamera({ ...previous.camera });
    setHistory(history.slice(0, -1));
  };
  const toggleFocusNode = (id: string) => {
    if (id === focus && history.length) goBack();
    else focusNode(id);
  };
  const importSummaries = async (file?: File) => {
    if (!file) return;
    try {
      const doc = parseSummaries(JSON.parse(await file.text()));
      const nodes = report.nodes.map((node) => ({ ...node }));
      const addedDiagnostics = attachSummaries(nodes, doc);
      setReport({ ...report, nodes, diagnostics: [...report.diagnostics, ...addedDiagnostics] });
      setNotice(
        `${doc.entries.length - addedDiagnostics.length}개 설명을 불러왔습니다.${addedDiagnostics.length ? ` ${addedDiagnostics.length}개 진단을 확인하세요.` : ""}`,
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
          {report.meta.mode === "changes" && (
            <span className="comparison-base" aria-label="Comparison base">
              {report.meta.baseRef}@{report.meta.baseCommit?.slice(0, 7)} → 작업 폴더
            </span>
          )}
        </div>
        <div className="mode-switch">
          <button
            className={!changes ? "active" : ""}
            onClick={() => {
              setChanges(false);
              setFilters({ ...filters, changed: false });
            }}
          >
            Structure
          </button>
          <button
            disabled={report.meta.mode !== "changes"}
            className={changes ? "active" : ""}
            onClick={() => setChanges(true)}
          >
            Changes
          </button>
        </div>
        {changes && (
          <div className="chart-legend">
            <span>
              <i className="legend-increase" />
              증가
            </span>
            <span>
              <i className="legend-decrease" />
              감소
            </span>
            <span>
              <i className="legend-modified" />
              동일 LOC 수정
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
            aria-label="Summary 불러오기"
            title="Summary 불러오기"
            onClick={() => summaryInput.current?.click()}
          >
            <FileUp />
            <span className="summary-label">Summary 불러오기</span>
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
            nodes={report.nodes}
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
            <Button variant="ghost" size="sm" onClick={() => focusNode(report.rootId)}>
              전체 보기
            </Button>
          </div>
          <div className="visible-scope">
            <span>
              {filters.changed || filters.extension || focus !== report.rootId
                ? "FILTERED VIEW"
                : "PROJECT OVERVIEW"}{" "}
              {filters.changed && "· 변경만"} {filters.extension && `· ${filters.extension}`}
            </span>
            <span>
              {format(layout?.root.data.afterLoc ?? 0)} current LOC
              {changes && ` · ${format(layout?.root.data.beforeLoc ?? 0)} baseline`}
            </span>
          </div>
          <MatrixChart
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
          <div className="chart-help">
            <span>드래그 이동 · 스크롤 확대 · Shift+스크롤 가로 이동</span>
            <span>클릭 상세 · 더블클릭 영역 확대</span>
          </div>
        </section>
        {right && (
          <Inspector
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
