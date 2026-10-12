import { createRoot } from "react-dom/client";
import { App } from "./App";
import { demoReport } from "./demo";
import type { Report } from "../shared/types";
import "./styles.css";

(window as unknown as { __mutrixMetrics: object }).__mutrixMetrics = { frames: [], drawn: 0 };
const raw = document.getElementById("mutrix-data")?.textContent?.trim();
try {
  const report: Report = raw && raw !== "__MUTRIX_REPORT_DATA__" ? JSON.parse(raw) : demoReport();
  if (
    report.schemaVersion !== 1 ||
    !Array.isArray(report.nodes) ||
    !report.nodes.some((node) => node.id === report.rootId)
  )
    throw new Error("Unsupported or invalid report data.");
  createRoot(document.getElementById("root")!).render(<App initialReport={report} />);
} catch (error) {
  const root = document.getElementById("root")!;
  root.textContent = `Cannot open this Mutrix report: ${error instanceof Error ? error.message : String(error)}`;
}
