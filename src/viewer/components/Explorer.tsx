import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { ReportNode } from "../../shared/types";
import type { Filters } from "../chart/layout";
import { NodeIcon } from "./NodeIcon";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { format, signed } from "../lib/utils";

interface Props {
  nodes: ReportNode[];
  index: Map<string, ReportNode>;
  rootId: string;
  selected: string;
  changes: boolean;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  filters: Filters;
  onFilters: (filters: Filters) => void;
}
export function Explorer({
  nodes,
  index,
  rootId,
  selected,
  changes,
  onSelect,
  onFocus,
  filters,
  onFilters,
}: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(new Set([rootId, "folder:src"]));
  const [limits, setLimits] = useState<Record<string, number>>({});
  const extensions = useMemo(
    () =>
      [
        ...new Set(
          nodes
            .filter((n) => n.kind === "file")
            .map((n) => (n.name.includes(".") ? `.${n.name.split(".").at(-1)}` : "")),
        ),
      ]
        .filter(Boolean)
        .sort(),
    [nodes],
  );
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const text = query.trim().toLowerCase();
    return nodes.filter(
      (node) =>
        node.kind !== "residual" &&
        `${node.path} ${node.name} ${node.id}`.toLowerCase().includes(text),
    );
  }, [nodes, query]);
  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows: { node: ReportNode; depth: number; more?: number }[] = [];
  const visit = (id: string, depth: number) => {
    const node = index.get(id)!;
    if (filters.changed && node.status === "unchanged") return;
    if (
      filters.extension &&
      (node.kind === "file" || node.kind === "scope" || node.kind === "residual") &&
      !node.path.endsWith(filters.extension)
    )
      return;
    rows.push({ node, depth });
    if (expanded.has(id)) {
      const children = node.children
        .map((id) => index.get(id)!)
        .filter((n) => n.kind !== "residual")
        .sort((a, b) =>
          filters.sort === "loc"
            ? b.afterLoc - a.afterLoc
            : filters.sort === "churn"
              ? b.added + b.removed - a.added - a.removed
              : a.name.localeCompare(b.name),
        );
      const limit = limits[id] ?? 100;
      children.slice(0, limit).forEach((child) => visit(child.id, depth + 1));
      if (children.length > limit)
        rows.push({ node, depth: depth + 1, more: children.length - limit });
    }
  };
  if (!query) visit(rootId, 0);
  return (
    <aside className="explorer">
      <div className="panel-heading">
        <span>EXPLORER</span>
        <SlidersHorizontal size={14} />
      </div>
      <div className="search-field">
        <Search size={14} />
        <Input
          aria-label="Search paths and symbols"
          placeholder="파일 또는 심볼 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="explorer-filters">
        <select
          aria-label="File type filter"
          value={filters.extension}
          onChange={(e) => onFilters({ ...filters, extension: e.target.value })}
        >
          <option value="">모든 파일 유형</option>
          {extensions.map((ext) => (
            <option key={ext}>{ext}</option>
          ))}
        </select>
        <select
          aria-label="Sort nodes"
          value={filters.sort}
          onChange={(e) => onFilters({ ...filters, sort: e.target.value as Filters["sort"] })}
        >
          <option value="path">경로순</option>
          <option value="loc">LOC순</option>
          <option value="churn">변경량순</option>
        </select>
      </div>
      <label className="changed-toggle">
        <input
          type="checkbox"
          checked={filters.changed}
          disabled={!changes}
          onChange={(e) => onFilters({ ...filters, changed: e.target.checked })}
        />
        변경된 영역만
        <span>{nodes.filter((n) => n.kind === "file" && n.status !== "unchanged").length}</span>
      </label>
      <div
        className="tree-list"
        role="tree"
        aria-label={query ? "Search results" : "Code structure"}
      >
        {query ? (
          <>
            <p className="result-count">
              {format(results.length)} results{results.length > 100 && " · first 100 shown"}
            </p>
            {results.slice(0, 100).map((node) => (
              <button
                key={node.id}
                className={`search-result ${selected === node.id ? "selected" : ""}`}
                onClick={() => onSelect(node.id)}
                onDoubleClick={() => onFocus(node.id)}
              >
                <NodeIcon node={node} />
                <span>
                  <strong>{node.name}</strong>
                  <small>{node.path}</small>
                </span>
                <em className={`delta ${node.status}`}>{signed(node.delta)}</em>
              </button>
            ))}
          </>
        ) : (
          rows.map(({ node, depth, more }, i) =>
            more ? (
              <Button
                key={`${node.id}-more-${i}`}
                variant="ghost"
                size="sm"
                className="more-row"
                onClick={() => setLimits({ ...limits, [node.id]: (limits[node.id] ?? 100) + 100 })}
              >
                + {format(more)} more
              </Button>
            ) : (
              <div
                key={node.id}
                className={`tree-row ${selected === node.id ? "selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 13 }}
                role="treeitem"
                aria-expanded={node.children.length ? expanded.has(node.id) : undefined}
                aria-selected={selected === node.id}
              >
                {node.children.length ? (
                  <button
                    className="tree-caret"
                    aria-label={`${expanded.has(node.id) ? "Collapse" : "Expand"} ${node.name}`}
                    onClick={() => toggle(node.id)}
                  >
                    {expanded.has(node.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                ) : (
                  <span className="tree-caret" />
                )}
                <button
                  className="tree-node"
                  onClick={() => onSelect(node.id)}
                  onDoubleClick={() => onFocus(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") {
                      setExpanded((prev) => new Set([...prev, node.id]));
                    }
                    if (e.key === "ArrowLeft") {
                      if (expanded.has(node.id)) toggle(node.id);
                      else if (node.parentId) onSelect(node.parentId);
                    }
                  }}
                >
                  <NodeIcon node={node} />
                  <span>{node.name}</span>
                  {changes && node.status !== "unchanged" && (
                    <i className={`change-dot ${node.status}`} />
                  )}
                </button>
              </div>
            ),
          )
        )}
        {query && results.length === 0 && (
          <p className="result-count">일치하는 파일·심볼이 없습니다.</p>
        )}
      </div>
      <div className="explorer-foot">
        <span>SNAPSHOT</span>
        <span>읽기 전용</span>
      </div>
    </aside>
  );
}
