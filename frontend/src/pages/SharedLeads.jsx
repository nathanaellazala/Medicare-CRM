import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Users, Search, Lock, LockOpen, ChevronRight, Radio, Trash2, Shuffle, Download, Shield, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useScrollRestore } from "@/lib/useScrollRestore";

export default function SharedLeads() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);
  const [selected, setSelected] = useState({});
  const [bulkAgent, setBulkAgent] = useState("");
  const [agents, setAgents] = useState([]);
  const [openAccess, setOpenAccess] = useState(false);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { sort };
      if (q) params.q = q;
      const { data } = await api.get("/shared-leads", { params });
      setItems(data.items);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, sort]);

  useEffect(() => {
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  useScrollRestore("shared-leads", !loading);

  // Load agents list once (owner only)
  useEffect(() => {
    if (!isOwner) return;
    api.get("/users").then((r) => setAgents(r.data.filter((u) => u.role === "agent"))).catch(() => {});
  }, [isOwner]);

  const openLead = async (lead) => {
    if (lead.is_locked) {
      toast.error(`Locked by ${lead.locked_by_name || "another agent"}. Try again in a few minutes.`);
      return;
    }
    setClaiming(lead.id);
    try {
      await api.post(`/shared-leads/${lead.id}/lock`);
      navigate(`/shared-leads/${lead.id}`);
    } catch (e) {
      if (e.response?.status === 423) {
        toast.error(e.response?.data?.detail || "This lead was just claimed by someone else. Refreshing…");
        load();
      } else {
        toast.error(formatApiError(e.response?.data?.detail));
      }
    } finally { setClaiming(null); }
  };

  // ---- Bulk actions ----
  const allSelected = items.length > 0 && items.every((l) => selected[l.id]);
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else {
      const next = {}; items.forEach((l) => { next[l.id] = true; }); setSelected(next);
    }
  };
  const toggleOne = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const clearSelection = () => setSelected({});

  const bulkAssign = async () => {
    if (!bulkAgent || selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Transfer ${selectedIds.length} shared lead${selectedIds.length === 1 ? "" : "s"} to the selected agent?\n\n` +
      "The leads will leave the shared pool and be assigned exclusively to that agent."
    );
    if (!confirmed) return;
    try {
      await api.post("/shared-leads/assign", { lead_ids: selectedIds, agent_id: bulkAgent });
      toast.success(`Transferred ${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"}`);
      setBulkAgent("");
      clearSelection();
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${selectedIds.length} shared lead${selectedIds.length === 1 ? "" : "s"}?\n\n` +
      "This cannot be undone."
    );
    if (!confirmed) return;
    try {
      const { data } = await api.post("/shared-leads/bulk-delete", { lead_ids: selectedIds });
      toast.success(`Deleted ${data.deleted ?? selectedIds.length} lead${(data.deleted ?? selectedIds.length) === 1 ? "" : "s"}`);
      clearSelection();
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const exportCsv = () => {
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/shared-leads/export/csv`, "_blank");
  };

  // ---- Sortable header helper ----
  const toggleSort = (key) => {
    const asc = `${key}_asc`, desc = `${key}_desc`;
    setSort((s) => (s === asc ? desc : asc));
  };
  const sortIcon = (key) => {
    if (sort === `${key}_asc`)  return <ArrowUp size={11} className="inline ml-1 text-[#026AA2]"/>;
    if (sort === `${key}_desc`) return <ArrowDown size={11} className="inline ml-1 text-[#026AA2]"/>;
    return null;
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
            <Radio size={13} className="text-[#026AA2]"/> Shared pool
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Shared Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Open a member to claim it — only one agent can work a shared lead at a time.
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setOpenAccess(true)}
              className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              data-testid="shared-access-btn"
              title="Choose which agents can see shared leads"
            >
              <Shield size={13} className="mr-1.5"/> Agent access
            </Button>
            <Button
              onClick={exportCsv}
              className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              data-testid="shared-export"
            >
              <Download size={13} className="mr-1.5"/> Export CSV
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shared members by name, city, plan..."
            className="pl-9 h-9"
            data-testid="shared-search"
          />
        </div>
        {isOwner && selectedIds.length > 0 && (
          <div className="flex items-center gap-2" data-testid="shared-bulk-bar">
            <span className="text-xs text-slate-600 font-medium">{selectedIds.length} selected</span>
            <Select value={bulkAgent} onValueChange={setBulkAgent}>
              <SelectTrigger className="h-8 w-48 bg-white" data-testid="shared-bulk-agent"><SelectValue placeholder="Transfer to..."/></SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={bulkAssign}
              disabled={!bulkAgent}
              className="h-8 text-white disabled:opacity-50"
              style={{ background: "#026AA2" }}
              data-testid="shared-bulk-transfer"
            >
              <Shuffle size={12} className="mr-1"/> Transfer
            </Button>
            <Button
              onClick={bulkDelete}
              className="h-8 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
              data-testid="shared-bulk-delete"
            >
              <Trash2 size={12} className="mr-1"/> Delete
            </Button>
            <Button
              onClick={clearSelection}
              className="h-8 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <Card className="p-0 border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full crm-table">
            <thead>
              <tr className="text-left">
                {isOwner && (
                  <th className="px-3 py-3 w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="shared-select-all"/>
                  </th>
                )}
                <th onClick={() => toggleSort("name")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]" data-testid="sort-name">Name{sortIcon("name")}</th>
                <th onClick={() => toggleSort("city")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Address{sortIcon("city")}</th>
                <th onClick={() => toggleSort("plan")} className="px-4 py-3 cursor-pointer select-none hover:text-[#026AA2]">Plan{sortIcon("plan")}</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isOwner ? 6 : 5} className="text-center py-12 text-slate-400 text-sm">Loading shared pool…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 6 : 5} className="text-center py-14 text-slate-400">
                    <Users size={28} className="mx-auto mb-2 text-slate-300"/>
                    <div className="text-sm font-medium text-slate-600">No shared leads right now.</div>
                    <div className="text-xs">Move leads to the shared pool from the Leads page.</div>
                  </td>
                </tr>
              )}
              {!loading && items.map((lead) => {
                const locked = lead.is_locked;
                const mine = lead.locked_by_me;
                return (
                  <tr key={lead.id}
                      data-testid={`shared-row-${lead.id}`}
                      className={locked ? "opacity-60" : ""}>
                    {isOwner && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={!!selected[lead.id]}
                          onCheckedChange={() => toggleOne(lead.id)}
                          data-testid={`shared-select-${lead.id}`}
                        />
                      </td>
                    )}
                    <td onDoubleClick={() => openLead(lead)} title="Double-click to claim & open" className={`px-4 py-3 text-sm font-medium text-slate-900 select-text ${locked ? "cursor-not-allowed" : "cursor-pointer"}`} data-testid={`shared-name-${lead.id}`}>
                      {lead.full_name || "—"}
                    </td>
                    <td onDoubleClick={() => openLead(lead)} className={`px-4 py-3 text-sm text-slate-700 select-text ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>{lead.address || "—"}</td>
                    <td onDoubleClick={() => openLead(lead)} className={`px-4 py-3 text-sm text-slate-700 select-text ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>{lead.plan || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs">
                      {mine ? (
                        <span className="inline-flex items-center gap-1 text-[#026AA2] font-medium" data-testid={`shared-mine-${lead.id}`}>
                          <LockOpen size={11}/> Held by you
                        </span>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium" data-testid={`shared-locked-${lead.id}`}>
                          <Lock size={11}/> In use by {lead.locked_by_name || "another agent"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium" data-testid={`shared-avail-${lead.id}`}>
                          <LockOpen size={11}/> Available
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      {claiming === lead.id ? (
                        <span className="text-[10px] text-[#026AA2]">Opening…</span>
                      ) : (
                        !locked && <ChevronRight size={14}/>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ================ AGENT ACCESS MODAL ================ */}
      {isOwner && (
        <AgentAccessDialog
          open={openAccess}
          onOpenChange={setOpenAccess}
          agents={agents}
          onSaved={() => api.get("/users").then((r) => setAgents(r.data.filter((u) => u.role === "agent"))).catch(() => {})}
        />
      )}
    </div>
  );
}

function AgentAccessDialog({ open, onOpenChange, agents, onSaved }) {
  const [saving, setSaving] = useState({});
  const toggle = async (a, checked) => {
    setSaving((s) => ({ ...s, [a.id]: true }));
    try {
      await api.patch(`/users/${a.id}`, { can_access_shared_pool: checked });
      toast.success(`${a.first_name} ${checked ? "granted" : "denied"} shared-pool access`);
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving((s) => ({ ...s, [a.id]: false })); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield size={16} className="text-[#026AA2]"/>
            Agent access to the shared pool
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Toggle which agents can see and claim shared leads. Agents without access won't see the Shared Leads page at all.
        </p>
        <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-md border border-slate-200 bg-slate-50">
              <div>
                <div className="text-sm font-medium text-slate-900">{a.first_name} {a.last_name}</div>
                <div className="text-xs text-slate-500">{a.email}</div>
              </div>
              <Switch
                checked={a.can_access_shared_pool !== false}
                disabled={saving[a.id]}
                onCheckedChange={(v) => toggle(a, v)}
                data-testid={`access-switch-${a.id}`}
              />
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">No agents yet.</div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="text-white" style={{ background: "#026AA2" }} data-testid="access-close">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
