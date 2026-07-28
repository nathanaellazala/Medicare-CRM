import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, formatBirthdate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Search, ChevronRight, Download, Upload, Award, Calendar as CalIcon, User as UserIcon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDateShort(iso) {
  if (!iso) return "—";
  // For YYYY-MM-DD strings (like effective_date), interpret in LOCAL time to
  // avoid the classic "picked Jul 1, displays as Jun 30" UTC-shift bug.
  const dateOnly = typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnly
    ? (() => {
        const [y, m, day] = iso.split("-").map(Number);
        return new Date(y, m - 1, day);
      })()
    : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function BookOfBusiness() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingEffective, setEditingEffective] = useState(null); // lead id
  const [editingCompleted, setEditingCompleted] = useState(null); // lead id
  const [effectiveDraft, setEffectiveDraft] = useState("");
  const [completedDraft, setCompletedDraft] = useState("");
  const [selected, setSelected] = useState({}); // { [leadId]: true }
  const [effFrom, setEffFrom] = useState("");
  const [effTo, setEffTo] = useState("");

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const allSelected = items.length > 0 && items.every((l) => selected[l.id]);
  const toggleOne = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else {
      const next = {};
      items.forEach((l) => { next[l.id] = true; });
      setSelected(next);
    }
  };
  const clearSelection = () => setSelected({});

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${selectedIds.length} completed client${selectedIds.length === 1 ? "" : "s"} from the Book of Business?\n\n` +
      "This cannot be undone."
    );
    if (!confirmed) return;
    try {
      const { data } = await api.post("/leads/bulk-delete", { lead_ids: selectedIds });
      toast.success(`Deleted ${data.deleted ?? selectedIds.length} client${selectedIds.length === 1 ? "" : "s"}`);
      clearSelection();
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = { status: "Complete", sort: "updated_desc", limit: 500 };
      if (q) params.q = q;
      if (effFrom) params.effective_from = effFrom;
      if (effTo)   params.effective_to = effTo;
      const { data } = await api.get("/leads", { params });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, effFrom, effTo]);

  const startEditEffective = (e, lead) => {
    e.stopPropagation();
    setEditingEffective(lead.id);
    setEffectiveDraft(lead.effective_date || "");
  };

  const saveEffectiveDate = async (leadId) => {
    try {
      await api.patch(`/leads/${leadId}`, { effective_date: effectiveDraft || null });
      toast.success("Effective date saved");
      setEditingEffective(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const startEditCompleted = (e, lead) => {
    e.stopPropagation();
    setEditingCompleted(lead.id);
    // pre-fill in YYYY-MM-DD form (HTML date input format)
    const iso = lead.completed_at || lead.updated_at || "";
    setCompletedDraft(iso ? iso.slice(0, 10) : "");
  };

  const saveCompletedDate = async (leadId) => {
    try {
      // Keep the time part of the original stamp when possible; otherwise noon UTC
      const dateOnly = completedDraft;
      const iso = dateOnly ? `${dateOnly}T12:00:00+00:00` : null;
      await api.patch(`/leads/${leadId}`, { completed_at: iso });
      toast.success("Completed date saved");
      setEditingCompleted(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
            <Award size={13} className="text-emerald-600"/> Wins
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Book of Business</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total.toLocaleString()} completed {total === 1 ? "client" : "clients"} — the ones you closed.
          </p>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Button
              onClick={() => navigate("/import?asComplete=1")}
              className="h-9 text-white"
              style={{ background: "#026AA2" }}
              data-testid="bob-upload"
            >
              <Upload size={14} className="mr-1.5" /> Upload wins
            </Button>
            <Button
              onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/leads/export/csv?status=Complete`, "_blank")}
              className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              data-testid="bob-export"
            >
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      {/* Search + filters + bulk-action bar */}
      <div className="bg-white border border-slate-200 rounded-md p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search completed clients by name, phone, county..."
            className="pl-9 h-9"
            data-testid="bob-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <CalIcon size={14} className="text-slate-500"/>
          <span className="text-xs text-slate-600 whitespace-nowrap">Effective</span>
          <Input
            type="date"
            value={effFrom}
            onChange={(e) => setEffFrom(e.target.value)}
            className="h-9 w-40 text-sm"
            data-testid="bob-eff-from"
            placeholder="From"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="date"
            value={effTo}
            onChange={(e) => setEffTo(e.target.value)}
            className="h-9 w-40 text-sm"
            data-testid="bob-eff-to"
            placeholder="To"
          />
          {(effFrom || effTo) && (
            <button
              onClick={() => { setEffFrom(""); setEffTo(""); }}
              className="text-xs text-slate-500 hover:text-slate-800 px-1"
              data-testid="bob-eff-clear"
            >
              Clear
            </button>
          )}
        </div>
        {isOwner && selectedIds.length > 0 && (
          <div className="flex items-center gap-2 ml-auto" data-testid="bob-bulk-bar">
            <span className="text-xs text-slate-600 font-medium">
              {selectedIds.length} selected
            </span>
            <Button
              onClick={bulkDelete}
              className="h-8 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
              data-testid="bob-bulk-delete"
            >
              <Trash2 size={13} className="mr-1.5"/> Delete
            </Button>
            <Button
              onClick={clearSelection}
              className="h-8 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              data-testid="bob-clear-selection"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full crm-table">
            <thead>
              <tr className="text-left">
                {isOwner && (
                  <th className="px-3 py-3 w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      data-testid="bob-select-all"
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Birthdate</th>
                <th className="px-4 py-3">City / State</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">
                  <span className="inline-flex items-center gap-1"><CalIcon size={11}/> Effective</span>
                </th>
                <th className="px-4 py-3">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 size={11}/> Completed</span>
                </th>
                {isOwner && (
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1"><UserIcon size={11}/> Completed by</span>
                  </th>
                )}
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isOwner ? 10 : 8} className="text-center py-12 text-slate-400 text-sm">Loading...</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 10 : 8} className="text-center py-14 text-slate-400">
                    <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-300"/>
                    <div className="text-sm font-medium text-slate-600">No completed clients yet.</div>
                    <div className="text-xs">Mark a lead as Complete to see it here.</div>
                  </td>
                </tr>
              )}
              {!loading && items.map((lead) => (
                <tr key={lead.id}
                    className="cursor-pointer"
                    data-testid={`bob-row-${lead.id}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}>
                  {isOwner && (
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!selected[lead.id]}
                        onCheckedChange={() => toggleOne(lead.id)}
                        data-testid={`bob-select-${lead.id}`}
                        aria-label={`Select ${lead.full_name}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 text-sm flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-emerald-500"/> {lead.full_name || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.phone_number || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatBirthdate(lead.birthdate) || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.city ? `${lead.city}, ${lead.state}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.medicaid_provider || "—"}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    {editingEffective === lead.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="date"
                          value={effectiveDraft}
                          onChange={(e) => setEffectiveDraft(e.target.value)}
                          className="h-7 text-xs w-36"
                          autoFocus
                          data-testid={`eff-input-${lead.id}`}
                        />
                        <Button
                          onClick={() => saveEffectiveDate(lead.id)}
                          className="h-7 px-2 text-xs text-white"
                          style={{ background: "#026AA2" }}
                          data-testid={`eff-save-${lead.id}`}
                        >Save</Button>
                        <button
                          onClick={() => setEditingEffective(null)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => startEditEffective(e, lead)}
                        className="inline-flex items-center gap-1.5 text-slate-700 hover:text-[#026AA2] hover:underline"
                        data-testid={`eff-edit-${lead.id}`}
                      >
                        {formatDateShort(lead.effective_date)}
                        <Pencil size={10} className="text-slate-400"/>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600" onClick={(e) => e.stopPropagation()} data-testid={`bob-completed-${lead.id}`}>
                    {editingCompleted === lead.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="date"
                          value={completedDraft}
                          onChange={(e) => setCompletedDraft(e.target.value)}
                          className="h-7 text-xs w-36"
                          autoFocus
                          data-testid={`comp-input-${lead.id}`}
                        />
                        <Button
                          onClick={() => saveCompletedDate(lead.id)}
                          className="h-7 px-2 text-xs text-white"
                          style={{ background: "#026AA2" }}
                          data-testid={`comp-save-${lead.id}`}
                        >Save</Button>
                        <button
                          onClick={() => setEditingCompleted(null)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => startEditCompleted(e, lead)}
                        className="inline-flex items-center gap-1.5 text-slate-700 hover:text-[#026AA2] hover:underline"
                        data-testid={`comp-edit-${lead.id}`}
                      >
                        {formatDateShort(lead.completed_at || lead.updated_at)}
                        <Pencil size={10} className="text-slate-400"/>
                      </button>
                    )}
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-sm text-slate-700" data-testid={`bob-cb-${lead.id}`}>
                      {lead.completed_by_name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserIcon size={11} className="text-slate-400"/>
                          {lead.completed_by_name}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  <td className="px-2 py-3 text-slate-400"><ChevronRight size={14}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
