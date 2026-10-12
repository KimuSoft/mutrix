import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Report } from "../../shared/types";
import { Button } from "./ui/button";
import suitLicense from "@sun-typeface/suit/LICENSE?raw";

export function DiagnosticsDialog({
  report,
  open,
  onClose,
}: {
  report: Report;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="diagnostics-dialog"
      aria-label="Analysis diagnostics"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="panel-heading">
        <span>ANALYSIS DIAGNOSTICS</span>
        <Button
          variant="ghost"
          size="icon"
          autoFocus
          aria-label="Close diagnostics"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <p className="microcopy">{report.meta.rootPath}</p>
      <ul>
        {report.diagnostics.length ? (
          report.diagnostics.map((item, i) => (
            <li key={i}>
              <span className={`status-label ${item.level}`}>{item.level}</span>
              <div>
                {item.path && <code>{item.path}</code>}
                <p>{item.message}</p>
              </div>
            </li>
          ))
        ) : (
          <li>진단이 없습니다.</li>
        )}
      </ul>
      <p className="microcopy">제외 규칙: {report.meta.excluded.join(", ") || "none"}</p>
      <details className="font-license">
        <summary>SUIT · Font license</summary>
        <pre>{suitLicense}</pre>
      </details>
    </dialog>
  );
}
