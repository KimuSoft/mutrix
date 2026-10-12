import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

export function ControlPopover({
  label,
  contentLabel,
  trigger,
  children,
  className = "",
  triggerClassName = "",
}: {
  label: string;
  contentLabel: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="chart-control-popover" ref={host}>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen((previous) => !previous)}
      >
        {trigger}
      </Button>
      {open && (
        <div
          id={id}
          className={`chart-guide-panel ${className}`}
          role="dialog"
          aria-label={contentLabel}
        >
          {children}
        </div>
      )}
    </div>
  );
}
