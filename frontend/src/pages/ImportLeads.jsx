import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, ChevronRight, CheckCircle2, AlertTriangle, Award } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

const TARGET_FIELDS = [
  { v: "", l: "— Skip —" },
  { v: "name", l: "Name (full)" },
  { v: "first_name", l: "First Name" },
  { v: "last_name", l: "Last Name" },
  { v: "birthdate", l: "Birthdate / DOB" },
  { v: "address", l: "Address" },
  { v: "city", l: "City" },
  { v: "state", l: "State" },
  { v: "zip_code", l: "Zip Code" },
  { v: "city_state_zip", l: "City State Zip (combined)" },
  { v: "county", l: "County" },
  { v: "phone_number", l: "Phone Number" },
  { v: "medicaid_number", l: "Medicaid Number" },
  { v: "medicare_number", l: "Medicare Number" },
  { v: "medicaid_provider", l: "Medicaid Provider / Plan" },
  { v: "medicare_parts", l: "Medicare Parts" },
  { v: "effective_date", l: "Effective Date" },
];

export default function ImportLeads() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const asComplete = params.get("asComplete") === "1";
  const [step, setStep] = useState(1); // 1 upload, 2 mapping, 3 result
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [duplicateHandling, setDuplicateHandling] = useState("skip");
  const [assignmentMethod, setAssignmentMethod] = useState("unassigned");
  const [leadType, setLeadType] = useState("New to Medicare");
  const [agentIds, setAgentIds] = useState([]);
  const [agents, setAgents] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/users").then((r) => setAgents(r.data.filter((u) => u.role === "agent" && u.status === "active"))).catch(() => {});
  }, []);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/imports/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
      setMapping(data.auto_mapping);
      setStep(2);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const payload = {
        rows: preview.rows,
        mapping,
        duplicate_handling: duplicateHandling,
        assignment_method: assignmentMethod,
        agent_ids: agentIds,
        lead_type: leadType,
        file_name: preview.filename || "import.csv",
      };
      if (asComplete) payload.default_lead_status = "Complete";
      const { data } = await api.post("/imports/commit", payload);
      setResult(data);
      setStep(3);
      toast.success(`Imported ${data.imported_rows} leads`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Import</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          {asComplete ? "Import Completed Clients" : "Import Leads"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {asComplete
            ? "Upload historical wins into the Book of Business. Every row will be saved with status Complete — include an Effective Date column and it'll map automatically."
            : "Upload a CSV or Excel file. We'll auto-detect columns and dedupe."}
        </p>
      </div>

      {asComplete && (
        <div className="mb-5 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="wins-mode-banner">
          <Award size={14}/>
          <span>Wins upload mode — all imported rows will land in <b>Book of Business</b>.</span>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-3 mb-6 text-sm">
        {[
          { n: 1, l: "Upload" }, { n: 2, l: "Map & Review" }, { n: 3, l: "Summary" }
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className={`flex items-center gap-2 ${step >= s.n ? "text-[#026AA2]" : "text-slate-400"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step >= s.n ? "bg-[#026AA2] text-white" : "bg-slate-100 text-slate-500"}`}>{s.n}</div>
              <span className="font-medium">{s.l}</span>
            </div>
            {i < 2 && <ChevronRight size={14} className="text-slate-300"/>}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <Card className="p-8 border-slate-200 rounded-md shadow-sm">
          <label className="border-2 border-dashed border-slate-300 rounded-md p-12 flex flex-col items-center justify-center cursor-pointer hover:border-[#026AA2] hover:bg-sky-50/50 transition-colors block">
            <Upload size={32} className="text-slate-400 mb-3"/>
            <div className="font-heading font-semibold text-slate-900 mb-1">Drop your spreadsheet here</div>
            <div className="text-sm text-slate-500 mb-4">or click to browse — CSV, XLS, XLSX up to 10MB</div>
            <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFile} className="hidden" data-testid="upload-input"/>
            <Button asChild className="text-white pointer-events-none" style={{ background: "#026AA2" }}>
              <span>{busy ? "Parsing..." : "Choose file"}</span>
            </Button>
          </label>
        </Card>
      )}

      {step === 2 && preview && (
        <>
          <Card className="p-5 mb-4 border-slate-200 rounded-md shadow-sm">
            <h2 className="font-heading text-base font-semibold text-slate-900 mb-1">
              {preview.filename} <span className="text-slate-500 font-normal">— {preview.total_rows} rows</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">Confirm how each spreadsheet column should map.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {preview.columns.map((col) => (
                <div key={col} className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-slate-700 font-medium truncate" title={col}>{col}</div>
                  <ChevronRight size={12} className="text-slate-400"/>
                  <Select value={mapping[col] || ""} onValueChange={(v) => setMapping({ ...mapping, [col]: v })}>
                    <SelectTrigger className="h-9 w-56" data-testid={`map-${col}`}>
                      <SelectValue placeholder="— Skip —"/>
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_FIELDS.map((t) => <SelectItem key={t.v} value={t.v || "skip"}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 mb-4 border-slate-200 rounded-md shadow-sm">
            <h3 className="font-heading text-sm font-semibold text-slate-900 mb-3">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {preview.columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5 mb-4 border-slate-200 rounded-md shadow-sm">
            <h3 className="font-heading text-sm font-semibold text-slate-900 mb-3">Options</h3>

            <div className="mb-5">
              <Label className="text-xs">Lead type — applies to every row in this upload</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {[
                  { v: "New to Medicare", desc: "First-time enrollees" },
                  { v: "Transfer", desc: "Switching from another plan" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setLeadType(opt.v)}
                    data-testid={`lead-type-${opt.v === "Transfer" ? "transfer" : "new"}`}
                    className={`text-left p-3 rounded-md border-2 transition-colors ${
                      leadType === opt.v
                        ? "border-[#026AA2] bg-sky-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                        leadType === opt.v ? "border-[#026AA2]" : "border-slate-300"
                      }`}>
                        {leadType === opt.v && <div className="w-full h-full rounded-full bg-[#026AA2] scale-50"/>}
                      </div>
                      <div className="font-semibold text-sm text-slate-900">{opt.v}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 ml-5">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                All {preview.total_rows} leads in this file will be labeled <strong>{leadType}</strong>. Agents can filter by type in the Leads page.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label className="text-xs">Duplicate handling</Label>
                <Select value={duplicateHandling} onValueChange={setDuplicateHandling}>
                  <SelectTrigger className="mt-1.5 h-9" data-testid="dup-handling"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip duplicates</SelectItem>
                    <SelectItem value="import_anyway">Import anyway (mark as duplicate)</SelectItem>
                    <SelectItem value="update_existing">Update existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Assignment</Label>
                <Select value={assignmentMethod} onValueChange={setAssignmentMethod}>
                  <SelectTrigger className="mt-1.5 h-9" data-testid="assign-method"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Leave unassigned</SelectItem>
                    <SelectItem value="round_robin">Round-robin to selected agents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {assignmentMethod === "round_robin" && (
              <div className="mt-4">
                <Label className="text-xs">Select agents</Label>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {agents.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded cursor-pointer hover:bg-slate-50">
                      <Checkbox
                        checked={agentIds.includes(a.id)}
                        onCheckedChange={(v) => setAgentIds(v ? [...agentIds, a.id] : agentIds.filter((x) => x !== a.id))}
                        data-testid={`agent-pick-${a.id}`}
                      />
                      <span className="text-sm">{a.first_name} {a.last_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="flex justify-end gap-2">
            <Button onClick={() => { setStep(1); setPreview(null); }} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Back</Button>
            <Button onClick={commit} disabled={busy} className="text-white" style={{ background: "#026AA2" }} data-testid="import-commit">
              {busy ? "Importing..." : `Import ${preview.total_rows} rows`}
            </Button>
          </div>
        </>
      )}

      {step === 3 && result && (
        <Card className="p-8 border-slate-200 rounded-md shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-green-600"/>
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold text-slate-900">Import complete</h2>
              <p className="text-sm text-slate-500">Here's the summary of your import batch.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
              ["Total rows", result.total_rows],
              ["Imported", result.imported_rows],
              ["Duplicates", result.duplicate_rows],
              ["Skipped", result.skipped_rows],
              ["Errors", result.error_rows],
              ["Auto-assigned", result.auto_assigned],
            ].map(([l, v]) => (
              <div key={l} className="kpi-card">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">{l}</div>
                <div className="font-heading text-2xl font-semibold text-slate-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/leads")} className="text-white" style={{ background: "#026AA2" }} data-testid="view-leads">View leads</Button>
            <Button onClick={() => { setStep(1); setPreview(null); setResult(null); setFile(null); }}
                    className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Import another</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
