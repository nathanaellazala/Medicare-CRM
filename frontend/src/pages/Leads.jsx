import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError, formatBirthdate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { Search, Filter, Download, Shuffle, ChevronRight, RefreshCw, Trash2, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";

export default function Leads() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") || "");
  const [status, setStatus] = useState(params.get("status") || "");
  const [agentFilter, setAgentFilter] = useState(params.get("agent_id") || "");
  const [leadType, setLeadType] = useState(params.get("lead_type") || "");
  const [sort, setSort] = useState(params.get("sort") || "updated_desc");
  const [sortCol, setSortCol] = useState(params.get("sortCol") || "");
  const [sortDir, setSortDir] = useState(params.get("sortDir") || "");
  const [statuses, setStatuses] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState({});
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAgent, setBulkAgent] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", phone_number: "", other_phone_number: "", birthdate: "", city: "", state: "", county: "", lead_type: "New to Medicare" });

  // Persist filters to URL so navigating back keeps the same view
  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (agentFilter) next.set("agent_id", agentFilter);
    if (leadType) next.set("lead_type", leadType);
    if (sort && sort !== "updated_desc") next.set("sort", sort);
    if (sortCol) { next.set("sortCol", sortCol); next.set("sortDir", sortDir); }
    setParams(next, { replace: true });
    // eslint-disable-next-line
  }, [q, status, agentFilter, leadType, sort, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortCol(""); setSortDir("");
  };
  const sortSuffix = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "";
  };

  const sortedItems = useMemo(() => {
    if (!sortCol) return items;
    const arr = [...items];
    arr.sort((a, b) => {
      const va = (a[sortCol] ?? "").toString().toLowerCase();
      const vb = (b[sortCol] ?? "").toString().toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [items, sortCol, sortDir]);

  const createLead = async () => {
    if (!addForm.first_name && !addForm.last_name) { toast.error("Enter a name"); return; }
    try {
      await api.post("/leads", addForm);
      toast.success("Lead added");
      setOpenAdd(false);
      setAddForm({ first_name: "", last_name: "", phone_number: "", other_phone_number: "", birthdate: "", city: "", state: "", county: "", lead_type: "New to Medicare" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = {};
      if (q) qs.q = q;
      if (status) qs.status = status;
      if (agentFilter && isOwner) qs.agent_id = agentFilter;
      if (leadType) qs.lead_type = leadType;
      if (sort) qs.sort = sort;
      const { data } = await api.get("/leads", { params: qs });
      // Hide "Complete" leads by default — they live in Book of Business.
      // Only include them if the user explicitly filtered by "Complete".
      const filtered = status === "Complete"
        ? data.items
        : data.items.filter((l) => l.lead_status !== "Complete");
      setItems(filtered);
      setTotal(filtered.length);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const deleteLead = async (id) => {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success("Lead deleted");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} leads? This cannot be undone.`)) return;
    try {
      const { data } = await api.post("/leads/bulk-delete", { lead_ids: selectedIds });
      toast.success(`Deleted ${data.deleted} leads`);
      setSelected({});
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  useEffect(() => {
    api.get("/statuses").then((r) => setStatuses(r.data)).catch(() => {});
    if (isOwner) api.get("/users").then((r) => setAgents(r.data.filter((u) => u.role === "agent"))).catch(() => {});
  }, [isOwner]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, agentFilter, leadType, sort]);

  useEffect(() => {
    const handler = setTimeout(() => load(), 250);
    return () => clearTimeout(handler);
    // eslint-disable-next-line
  }, [q]);

  const agentName = (id) => {
    if (!id) return <span className="text-slate-400 italic">Unassigned</span>;
    const a = agents.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "—";
  };

  const toggleAll = (v) => {
    const next = {};
    if (v) items.forEach((i) => (next[i.id] = true));
    setSelected(next);
  };

  const bulkApplyStatus = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    try {
      await api.post("/leads/bulk-status", { lead_ids: selectedIds, lead_status: bulkStatus });
      toast.success(`Updated ${selectedIds.length} leads`);
      setSelected({}); setBulkStatus("");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const bulkAssign = async () => {
    if (!bulkAgent || selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Reassigning ${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"}.\n\n` +
      "⚠️  This will PERMANENTLY DELETE all notes, call logs, and reset the status to Uncalled — the receiving agent gets a clean slate.\n\n" +
      "Continue?"
    );
    if (!confirmed) return;
    try {
      await api.post("/leads/assign", { lead_ids: selectedIds, agent_id: bulkAgent });
      toast.success(`Assigned ${selectedIds.length} leads`);
      setSelected({}); setBulkAgent("");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const bulkMoveShared = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Move ${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"} to the shared pool?\n\n` +
      "⚠️  Notes, call logs, and status will be reset — any agent will then be able to claim these leads.\n\n" +
      "Continue?"
    );
    if (!confirmed) return;
    try {
      const { data } = await api.post("/shared-leads/move", { lead_ids: selectedIds });
      toast.success(`${data.moved} lead${data.moved === 1 ? "" : "s"} moved to shared pool`);
      setSelected({});
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const quickStatus = async (id, newStatus) => {
    // Optimistic local update — no full reload, so the agent stays in the
    // same scroll position and their filter/sort state is preserved.
    try {
      const { data: updated } = await api.patch(`/leads/${id}`, { lead_status: newStatus });
      setItems((prev) => {
        // If the user is not filtering explicitly by "Complete", drop the row
        // once it turns Complete (it now lives in Book of Business).
        if (newStatus === "Complete" && status !== "Complete") {
          const next = prev.filter((l) => l.id !== id);
          setTotal(next.length);
          return next;
        }
        return prev.map((l) => (l.id === id ? { ...l, ...updated } : l));
      });
      toast.success("Status updated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
            {isOwner ? "All Leads" : "My Leads"}
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">
            {total.toLocaleString()} {total === 1 ? "lead" : "leads"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenAdd(true)} className="h-9 text-white" style={{ background: "#026AA2" }} data-testid="add-lead-button">
            + Add lead
          </Button>
          <Button onClick={load} className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="leads-refresh">
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
          {isOwner && (
            <Button
              onClick={() => {
                const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(agentFilter && { agent_id: agentFilter }) });
                window.open(`${process.env.REACT_APP_BACKEND_URL}/api/leads/export/csv?${qs}`, "_blank");
              }}
              className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              data-testid="leads-export"
            >
              <Download size={14} className="mr-1.5" /> Export
            </Button>
          )}
          {isOwner && (
            <Button onClick={() => navigate("/assign")} className="h-9 text-white" style={{ background: "#026AA2" }} data-testid="leads-assign">
              <Shuffle size={14} className="mr-1.5" /> Assign
            </Button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-slate-200 rounded-md p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, county, city..."
            className="pl-9 h-9"
            data-testid="leads-search"
          />
        </div>

        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-44" data-testid="filter-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {isOwner && (
          <Select value={agentFilter || "all"} onValueChange={(v) => setAgentFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-44" data-testid="filter-agent">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={leadType || "all"} onValueChange={(v) => setLeadType(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-40" data-testid="filter-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="New to Medicare">New to Medicare</SelectItem>
            <SelectItem value="Transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-44" data-testid="filter-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_desc">Recently updated</SelectItem>
            <SelectItem value="created_desc">Newest</SelectItem>
            <SelectItem value="created_asc">Oldest</SelectItem>
            <SelectItem value="name_asc">Name A→Z</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk bar */}
      {isOwner && selectedIds.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-md px-4 py-2.5 mb-3 flex items-center gap-3" data-testid="bulk-bar">
          <span className="text-sm font-medium text-sky-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="h-8 w-44 bg-white" data-testid="bulk-status-select"><SelectValue placeholder="Set status"/></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={bulkApplyStatus} className="h-8 text-white" style={{ background: "#026AA2" }} data-testid="bulk-apply-status">Apply</Button>
            <Select value={bulkAgent} onValueChange={setBulkAgent}>
              <SelectTrigger className="h-8 w-44 bg-white" data-testid="bulk-agent-select"><SelectValue placeholder="Assign to..."/></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={bulkAssign} className="h-8 text-white" style={{ background: "#026AA2" }} data-testid="bulk-apply-assign">Assign</Button>
            <Button
              onClick={bulkMoveShared}
              className="h-8 bg-white border border-[#026AA2] text-[#026AA2] hover:bg-sky-50"
              data-testid="bulk-move-shared"
              title="Move selected leads into the shared pool — any agent can claim them"
            >
              <Radio size={12} className="mr-1"/> To shared pool
            </Button>
            <Button onClick={bulkDelete} className="h-8 bg-red-600 hover:bg-red-700 text-white" data-testid="bulk-delete">
              <Trash2 size={12} className="mr-1"/> Delete
            </Button>
          </div>
          <Button onClick={() => setSelected({})} className="h-8 ml-auto bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full crm-table">
            <thead>
              <tr className="text-left">
                {isOwner && <th className="px-3 py-3 w-10">
                  <Checkbox onCheckedChange={toggleAll} data-testid="select-all"
                            checked={items.length > 0 && selectedIds.length === items.length}/>
                </th>}
                <th onClick={() => toggleSort("full_name")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Name{sortSuffix("full_name")}</th>
                <th className="px-4 py-3">Phone</th>
                <th onClick={() => toggleSort("birthdate")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Birthdate{sortSuffix("birthdate")}</th>
                <th onClick={() => toggleSort("county")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">County{sortSuffix("county")}</th>
                <th className="px-4 py-3">City / State</th>
                <th className="px-4 py-3">Type</th>
                <th onClick={() => toggleSort("lead_status")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Status{sortSuffix("lead_status")}</th>
                {isOwner && <th className="px-4 py-3">Agent</th>}
                <th onClick={() => toggleSort("medicaid_provider")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Provider{sortSuffix("medicaid_provider")}</th>
                <th onClick={() => toggleSort("updated_at")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Updated{sortSuffix("updated_at")}</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isOwner ? 11 : 10} className="text-center py-12 text-slate-400 text-sm">Loading...</td></tr>
              )}
              {!loading && sortedItems.length === 0 && (
                <tr><td colSpan={isOwner ? 11 : 10} className="text-center py-12 text-slate-400 text-sm">No leads found.</td></tr>
              )}
              {!loading && sortedItems.map((lead) => (
                <tr key={lead.id} className="cursor-pointer" data-testid={`lead-row-${lead.id}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}>
                  {isOwner && (
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!selected[lead.id]}
                        onCheckedChange={(v) => setSelected({ ...selected, [lead.id]: !!v })}
                        data-testid={`select-${lead.id}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 text-sm">{lead.full_name || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.phone_number || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatBirthdate(lead.birthdate) || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.county || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {lead.city ? `${lead.city}, ${lead.state}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                      lead.lead_type === "Transfer"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {lead.lead_type === "Transfer" ? "Transfer" : "New"}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select value={lead.lead_status} onValueChange={(v) => quickStatus(lead.id, v)}>
                      <SelectTrigger data-testid={`quick-status-${lead.id}`} className="h-7 w-auto min-w-[140px] border-0 bg-transparent p-0 hover:bg-slate-100 px-2 [&>span]:line-clamp-none [&>svg]:hidden focus:ring-0">
                        <StatusBadge status={lead.lead_status}/>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => <SelectItem key={s.id} value={s.name} data-testid={`quick-status-opt-${lead.id}-${s.name.replace(/\s+/g, "-")}`}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  {isOwner && <td className="px-4 py-3 text-sm text-slate-700">{agentName(lead.assigned_agent_id)}</td>}
                  <td className="px-4 py-3 text-sm text-slate-700">{lead.medicaid_provider || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {lead.updated_at ? new Date(lead.updated_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-2 py-3 text-slate-400" onClick={(e) => e.stopPropagation()}>
                    {isOwner ? (
                      <button
                        onClick={() => deleteLead(lead.id)}
                        title="Delete lead"
                        className="p-1 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                        data-testid={`del-${lead.id}`}
                      >
                        <Trash2 size={13}/>
                      </button>
                    ) : (
                      <ChevronRight size={14}/>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Add Lead Dialog */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add new lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">First name</label>
              <Input value={addForm.first_name} onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })} className="mt-1.5" data-testid="add-first-name"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Last name</label>
              <Input value={addForm.last_name} onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })} className="mt-1.5" data-testid="add-last-name"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Phone</label>
              <Input value={addForm.phone_number} onChange={(e) => setAddForm({ ...addForm, phone_number: e.target.value })} className="mt-1.5" data-testid="add-phone"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Other phone</label>
              <Input value={addForm.other_phone_number} onChange={(e) => setAddForm({ ...addForm, other_phone_number: e.target.value })} className="mt-1.5"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Birthdate</label>
              <Input type="date" value={addForm.birthdate} onChange={(e) => setAddForm({ ...addForm, birthdate: e.target.value })} className="mt-1.5"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">County</label>
              <Input value={addForm.county} onChange={(e) => setAddForm({ ...addForm, county: e.target.value })} className="mt-1.5"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">City</label>
              <Input value={addForm.city} onChange={(e) => setAddForm({ ...addForm, city: e.target.value })} className="mt-1.5"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">State</label>
              <Input value={addForm.state} onChange={(e) => setAddForm({ ...addForm, state: e.target.value.toUpperCase().slice(0, 2) })} className="mt-1.5"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-700">Lead type</label>
              <Select value={addForm.lead_type} onValueChange={(v) => setAddForm({ ...addForm, lead_type: v })}>
                <SelectTrigger className="mt-1.5 h-9"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="New to Medicare">New to Medicare</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button onClick={() => setOpenAdd(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={createLead} className="text-white" style={{ background: "#026AA2" }} data-testid="add-lead-save">Add lead</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
