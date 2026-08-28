import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Small icon-only copy-to-clipboard button. Renders a Copy icon that swaps to
 * a green Check for 1.2s after a successful copy. Used next to Medicare and
 * Medicaid numbers so agents don't have to highlight+copy manually.
 */
export function CopyButton({ value, label, size = 12, className = "", testId }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  const doCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(String(value));
      setOk(true);
      setTimeout(() => setOk(false), 1200);
    } catch (err) {
      // Fallback for older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = String(value);
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      } catch { /* give up */ }
    }
  };
  return (
    <button
      type="button"
      onClick={doCopy}
      onDoubleClick={(e) => e.stopPropagation()}
      title={ok ? "Copied!" : `Copy ${label || "value"}`}
      className={`inline-flex items-center justify-center rounded p-0.5 hover:bg-sky-50 ${ok ? "text-emerald-600" : "text-slate-400 hover:text-[#026AA2]"} ${className}`}
      data-testid={testId}
    >
      {ok ? <Check size={size}/> : <Copy size={size}/>}
    </button>
  );
}
