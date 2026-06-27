import React from "react";

const STATUS_STYLES = {
  Uncalled:               { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" },
  "No Answer":            { bg: "#FEF9C3", text: "#854D0E", border: "#FEF08A" },
  "Left Voicemail":       { bg: "#FFEDD5", text: "#C2410C", border: "#FED7AA" },
  "Call Back Later":      { bg: "#DBEAFE", text: "#1D4ED8", border: "#BFDBFE" },
  "Appointment Set":      { bg: "#F3E8FF", text: "#7E22CE", border: "#E9D5FF" },
  "Application Started":  { bg: "#E0E7FF", text: "#4338CA", border: "#C7D2FE" },
  Pending:                { bg: "#CCFBF1", text: "#0F766E", border: "#99F6E4" },
  Sold:                   { bg: "#DCFCE7", text: "#15803D", border: "#BBF7D0" },
  "Not Interested":       { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" },
  "No Medicare":          { bg: "#991B1B", text: "#FFFFFF", border: "#7F1D1D" },
  "No Medicare Part B":   { bg: "#991B1B", text: "#FFFFFF", border: "#7F1D1D" },
  "Wrong Number":         { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" },
  "Disconnected Number":  { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" },
  "Do Not Call":          { bg: "#1E293B", text: "#FFFFFF", border: "#0F172A" },
  Duplicate:              { bg: "#E2E8F0", text: "#475569", border: "#94A3B8" },
  Ineligible:             { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Uncalled;
  return (
    <span
      data-testid={`status-badge-${(status || "").toLowerCase().replace(/\s+/g, "-")}`}
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {status || "Uncalled"}
    </span>
  );
}
