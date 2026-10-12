import type { Report } from "../shared/types";

export const REPORT_MARKER = "__MUTRIX_REPORT_DATA__";
export function renderHtml(template: string, report: Report): string {
  const marker = `<script id="mutrix-data" type="application/json">${REPORT_MARKER}</script>`;
  if (!template.includes(marker))
    throw new Error("Report template is missing its data placeholder. Run bun run build:viewer.");
  // Escape markup, not just quotes: source paths and summaries may contain </script>.
  const payload = JSON.stringify(report)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return template.replace(
    marker,
    () => `<script id="mutrix-data" type="application/json">${payload}</script>`,
  );
}
