import {
  ArrowDownRight,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Focus,
  ArrowLeftRight,
} from "lucide-react";
import type { ReportNode } from "../../shared/types";
import { percentLabel } from "../../shared/colors";
import { NodeIcon } from "./NodeIcon";
import { Button } from "./ui/button";
import { format, signed, copy } from "../lib/utils";
import { editorUri } from "../lib/node-links";
import { NodeBadge } from "./NodeBadge";

export function Inspector({
  warnLoc,
  node,
  rootPath,
  changes,
  onFocus,
  onSelect,
  notify,
}: {
  warnLoc: number;
  node: ReportNode;
  rootPath: string;
  changes: boolean;
  onFocus: (id: string) => void;
  onSelect: (id: string) => void;
  notify: (message: string) => void;
}) {
  const absolute = `${rootPath.replace(/[\\/]$/, "")}${node.path ? `/${node.path}` : ""}`.replace(
    /\\/g,
    "/",
  );
  const range = node.afterRange ?? node.beforeRange;
  const uri = editorUri(rootPath, node);
  const packageSnapshot = node.package?.after ?? node.package?.before;
  const statusCaption = changes
    ? node.status === "added" || node.status === "deleted"
      ? undefined
      : node.status
    : node.kind;
  const doCopy = async (value: string, message: string) => {
    try {
      await copy(value);
      notify(message);
    } catch (error) {
      notify(String(error));
    }
  };
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span>INSPECTOR</span>
        <span className="inspector-status">
          {statusCaption && <span className={`status-label ${node.status}`}>{statusCaption}</span>}
          <NodeBadge node={node} changes={changes} warnLoc={warnLoc} />
        </span>
      </div>
      <div className="inspector-title">
        <div className="node-symbol">
          <NodeIcon node={node} size={22} />
        </div>
        <span>
          {node.package
            ? `${packageSnapshot?.kind === "cargo" ? "crate" : "package"}${packageSnapshot?.name ? ` · ${packageSnapshot.name}` : ""}`
            : (node.symbolKind ?? node.kind)}
        </span>
        <h2>{node.name}</h2>
        <p>{node.path || "Project root"}</p>
      </div>
      <div className="inspector-actions">
        <Button size="sm" variant="outline" onClick={() => onFocus(node.id)}>
          <Focus />
          영역 확대
        </Button>
        <Button
          size="icon"
          variant="outline"
          title="Copy file path"
          aria-label="Copy file path"
          onClick={() => doCopy(absolute, "경로를 복사했습니다.")}
        >
          <Copy />
        </Button>
        <Button
          size="icon"
          variant="outline"
          disabled={node.status === "deleted"}
          asChild={node.status !== "deleted"}
          title="Open in VS Code"
          aria-label="Open in VS Code"
        >
          {node.status === "deleted" ? (
            <ExternalLink />
          ) : (
            <a href={uri}>
              <ExternalLink />
            </a>
          )}
        </Button>
      </div>
      <section className="inspector-section">
        <h3>LINES OF CODE</h3>
        <div className="loc-main">
          {format(node.afterLoc)}
          <span>current lines</span>
        </div>
        {changes && (
          <>
            <div className="loc-compare">
              <span>기준 {format(node.beforeLoc)}</span>
              <b className={`delta ${node.delta > 0 ? "added" : node.delta < 0 ? "deleted" : ""}`}>
                {signed(node.delta)} <small>{percentLabel(node)}</small>
              </b>
            </div>
            <div className="churn-row">
              <span>
                <ArrowUpRight size={14} />+{format(node.added)} 추가
              </span>
              <span>
                <ArrowDownRight size={14} />−{format(node.removed)} 삭제
              </span>
            </div>
          </>
        )}
        <div className="metric-row">
          <span>차트 표시 크기</span>
          <b>{format(changes ? node.weight : node.afterLoc)} LOC</b>
        </div>
        {changes && <p className="microcopy">각 말단 영역의 전후 큰 값으로 공간을 확보합니다.</p>}
      </section>
      {range && (
        <section className="inspector-section">
          <h3>SOURCE RANGE</h3>
          {node.beforeRange && changes && (
            <div className="metric-row">
              <span>기준</span>
              <code>
                {node.beforeRange.startLine}–{node.beforeRange.endLine}
              </code>
            </div>
          )}
          {node.afterRange && (
            <div className="metric-row">
              <span>현재</span>
              <code>
                {node.afterRange.startLine}–{node.afterRange.endLine}
              </code>
            </div>
          )}
        </section>
      )}
      {node.rename && (
        <section className="inspector-section">
          <h3>
            <ArrowLeftRight size={13} /> FILE MOVE
          </h3>
          <p className="microcopy">각 폴더의 실제 소속으로 집계됩니다.</p>
          <button className="rename-link" onClick={() => onSelect(node.rename!.nodeId)}>
            {node.rename.path}
          </button>
        </section>
      )}
      <section className="inspector-section">
        <h3>
          NODE ID
          <Button
            size="icon"
            variant="ghost"
            title="Copy node ID"
            aria-label="Copy node ID"
            onClick={() => doCopy(node.id, "노드 ID를 복사했습니다.")}
          >
            <Copy />
          </Button>
        </h3>
        <code className="node-id">{node.id}</code>
      </section>
    </aside>
  );
}
