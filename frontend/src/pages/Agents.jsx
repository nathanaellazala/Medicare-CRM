import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, CheckCircle, Trophy, Circle, ShieldCheck, Pencil, Save, BarChart3, Radio } from "lucide-react";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(null);      // agent being edited
  const [editForm, setEditForm] = useState({});
  const [openPerms, setOpenPerms] = useState(null);
  const [permFields, setPermFields] = useState([]);
  const [permSelected, setPermSelected] = useState([]);
  const [openHist, setOpenHist] = useState(null);
  const [histData, setHistData] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [resetPass, setResetPass] = useState("");

  const load = async () => {
    const { data } = await api.get("/users");
    const enriched = await Promise.all(data.map(async (u) => {
      try {
        const { data: act } = await api.get(`/users/${u.id}/activity`);
        return { ...u, today_minutes: act.today_minutes, week_minutes: act.week_minutes };
      } catch {
        return { ...u, today_minutes: 0, week_minutes: 0 };
      }
    }));
    setAgents(enriched);
  };
  useEffect(() => {
    load();
    api.get("/constants/toggleable-fields").then((r) => setPermFields(r.data)).catch(() => {});
  }, []);

  // ---- Edit agent modal ----
  const openEditModal = (a) => {
    setOpenEdit(a);
    setEditForm({
      first_name: a.first_name || "",
      last_name: a.last_name || "",
      email: a.email || "",
      status: a.status || "active",
      on_leaderboard: a.on_leaderboard !== false,
      can_access_shared_pool: a.can_access_shared_pool !== false,
    });
    setResetPass("");
  };

  const saveEdit = async () => {
    if (!openEdit) return;
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        status: editForm.status,
        on_leaderboard: editForm.on_leaderboard,
        can_access_shared_pool: editForm.can_access_shared_pool,
      };
      await api.patch(`/users/${openEdit.id}`, payload);
      if (resetPass) {
        if (resetPass.length < 8) { toast.error("New password must be 8+ chars"); return; }
        await api.post(`/users/${openEdit.id}/reset-password`, { password: resetPass });
      }
      toast.success(`${editForm.first_name} updated`);
      setOpenEdit(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // ---- Permissions modal ----
  const openPermissions = (a) => {
    setOpenPerms(a);
    setPermSelected(a.visible_fields || permFields.map((f) => f.key));
  };

  const togglePerm = (key) => {
    setPermSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key]);
  };

  const savePermissions = async () => {
    try {
      await api.patch(`/users/${openPerms.id}`, { visible_fields: permSelected });
      toast.success(`Access updated for ${openPerms.first_name}`);
      setOpenPerms(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const selectAll = () => setPermSelected(permFields.map((f) => f.key));
  const selectNone = () => setPermSelected([]);

  // ---- Activity history modal ----
  const openHistory = async (a) => {
    setOpenHist(a);
    setHistData(null);
    setHistLoading(true);
    try {
      const { data } = await api.get(`/users/${a.id}/activity-history`);
      setHistData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setHistLoading(false); }
  };

  const createAgent = async () => {
    try {
      await api.post("/users", { ...form, role: "agent" });
      toast.success("Agent created");
      setOpenCreate(false);
      setForm({ first_name: "", last_name: "", email: "", password: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Team</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Agents</h1>
          <p className="text-sm text-slate-500 mt-1">Click an agent's name to edit — change details, toggle leaderboard visibility, deactivate, or reset password.</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="h-9 text-white" style={{ background: "#026AA2" }} data-testid="add-agent-button">
              <UserPlus size={14} className="mr-1.5"/> Add agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a new agent</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">First name</Label>
                  <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="mt-1.5" data-testid="agent-first"/>
                </div>
                <div>
                  <Label className="text-xs">Last name</Label>
                  <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="mt-1.5" data-testid="agent-last"/>
                </div>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" data-testid="agent-email"/>
              </div>
              <div>
                <Label className="text-xs">Temporary password</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" data-testid="agent-password"/>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpenCreate(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
              <Button onClick={createAgent} className="text-white" style={{ background: "#026AA2" }} data-testid="agent-save">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 border-slate-200 rounded-md shadow-sm overflow-hidden">
        <table className="w-full crm-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Time (Today / Week)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Leaderboard</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const act = a.activity_status || "inactive";
              const actColor = act === "active" ? "text-green-600" : act === "idle" ? "text-amber-500" : "text-slate-400";
              const actLabel = act === "active" ? "Active now" : act === "idle" ? "Idle" : "Inactive";
              return (
              <tr key={a.id} data-testid={`agent-row-${a.id}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {a.role === "owner" ? (
                    <span>{a.first_name} {a.last_name}</span>
                  ) : (
                    <button
                      onClick={() => openEditModal(a)}
                      className="text-slate-900 hover:text-[#026AA2] hover:underline text-left inline-flex items-center gap-1.5"
                      data-testid={`agent-name-${a.id}`}
                    >
                      {a.first_name} {a.last_name}
                      <Pencil size={11} className="text-slate-400"/>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{a.email}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex items-center gap-1.5 ${actColor}`} data-testid={`activity-${a.id}`}>
                    <Circle size={8} className="fill-current"/>
                    {actLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-col gap-0.5" data-testid={`time-${a.id}`}>
                    <span className="text-slate-800 font-medium">
                      {Math.floor((a.today_minutes || 0) / 60)}h {(a.today_minutes || 0) % 60}m <span className="text-slate-400 font-normal">today</span>
                    </span>
                    <span className="text-slate-600">
                      {Math.floor((a.week_minutes || 0) / 60)}h {(a.week_minutes || 0) % 60}m <span className="text-slate-400">this week</span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    a.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`} data-testid={`status-${a.id}`}>{a.status}</span>
                </td>
                <td className="px-4 py-3">
                  {a.role === "owner" ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <span
                      data-testid={`lb-${a.id}`}
                      className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                        a.on_leaderboard !== false
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      <Trophy size={10}/> {a.on_leaderboard !== false ? "Visible" : "Hidden"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {a.role !== "owner" && (
                      <>
                        <Button
                          onClick={() => openEditModal(a)}
                          className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-sky-50 hover:text-[#026AA2] hover:border-[#026AA2]"
                          title="Edit agent"
                          data-testid={`edit-${a.id}`}
                        >
                          <Pencil size={12}/>
                        </Button>
                        <Button
                          onClick={() => openHistory(a)}
                          className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-sky-50 hover:text-[#026AA2] hover:border-[#026AA2]"
                          title="Activity history (3 months)"
                          data-testid={`history-${a.id}`}
                        >
                          <BarChart3 size={12}/>
                        </Button>
                        <Button
                          onClick={() => openPermissions(a)}
                          className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-sky-50 hover:text-[#026AA2] hover:border-[#026AA2]"
                          title="Manage lead-field access"
                          data-testid={`perms-${a.id}`}
                        >
                          <ShieldCheck size={12}/>
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ================ EDIT AGENT MODAL ================ */}
      <Dialog open={!!openEdit} onOpenChange={(o) => { if (!o) setOpenEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={16} className="text-[#026AA2]"/>
              Edit {openEdit?.first_name} {openEdit?.last_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name</Label>
                <Input
                  value={editForm.first_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="mt-1.5"
                  data-testid="edit-first"
                />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input
                  value={editForm.last_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="mt-1.5"
                  data-testid="edit-last"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="mt-1.5"
                data-testid="edit-email"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md border border-slate-200 bg-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <CheckCircle size={13} className={editForm.status === "active" ? "text-green-600" : "text-slate-400"}/>
                    Account active
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Deactivated agents can't log in and won't receive new lead assignments.
                  </div>
                </div>
                <Switch
                  checked={editForm.status === "active"}
                  onCheckedChange={(v) => setEditForm({ ...editForm, status: v ? "active" : "inactive" })}
                  data-testid="edit-status-switch"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-md border border-slate-200 bg-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <Trophy size={13} className={editForm.on_leaderboard ? "text-amber-500" : "text-slate-400"}/>
                    Show on leaderboard
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Hide this agent from the leaderboard without deactivating them.
                  </div>
                </div>
                <Switch
                  checked={!!editForm.on_leaderboard}
                  onCheckedChange={(v) => setEditForm({ ...editForm, on_leaderboard: v })}
                  data-testid="edit-lb-switch"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-md border border-slate-200 bg-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <Radio size={13} className={editForm.can_access_shared_pool ? "text-[#026AA2]" : "text-slate-400"}/>
                    Shared pool access
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Let this agent see and claim leads in the Shared Leads pool.
                  </div>
                </div>
                <Switch
                  checked={!!editForm.can_access_shared_pool}
                  onCheckedChange={(v) => setEditForm({ ...editForm, can_access_shared_pool: v })}
                  data-testid="edit-shared-switch"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound size={12} className="text-slate-500"/>
                Reset password (optional)
              </Label>
              <Input
                type="text"
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="mt-1.5"
                data-testid="edit-new-pass"
              />
              <p className="text-[11px] text-slate-500 mt-1">Min 8 characters. Share the new password with your agent securely.</p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpenEdit(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="edit-cancel">Cancel</Button>
            <Button onClick={saveEdit} className="text-white" style={{ background: "#026AA2" }} data-testid="edit-save">
              <Save size={13} className="mr-1.5"/> Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================ PERMISSIONS MODAL ================ */}
      <Dialog open={!!openPerms} onOpenChange={(o) => { if (!o) setOpenPerms(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#026AA2]"/>
              Lead access for {openPerms?.first_name} {openPerms?.last_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            Pick the fields this agent can see on their leads. Hidden fields are blanked out server-side —
            they won't appear in the table, lead detail, search results, or API responses. Name, status, and
            notes are always visible.
          </p>
          <div className="flex gap-2 mt-1 mb-2">
            <button onClick={selectAll} className="text-xs text-[#026AA2] hover:underline" data-testid="perms-all">Select all</button>
            <span className="text-xs text-slate-300">·</span>
            <button onClick={selectNone} className="text-xs text-slate-500 hover:underline" data-testid="perms-none">Select none</button>
            <span className="ml-auto text-xs text-slate-500">{permSelected.length} / {permFields.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {permFields.map((f) => {
              const active = permSelected.includes(f.key);
              return (
                <label key={f.key}
                       className={`flex items-center gap-2 p-2.5 border rounded-md cursor-pointer transition-colors ${
                         active ? "border-[#026AA2] bg-sky-50/50" : "border-slate-200 hover:bg-slate-50"
                       }`}>
                  <Checkbox
                    checked={active}
                    onCheckedChange={() => togglePerm(f.key)}
                    data-testid={`perm-${f.key}`}
                  />
                  <span className="text-sm text-slate-800">{f.label}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter className="mt-3">
            <Button onClick={() => setOpenPerms(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={savePermissions} className="text-white" style={{ background: "#026AA2" }} data-testid="perms-save">
              Save access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================ ACTIVITY HISTORY MODAL ================ */}
      <Dialog open={!!openHist} onOpenChange={(o) => { if (!o) { setOpenHist(null); setHistData(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 size={16} className="text-[#026AA2]"/>
              Activity history — {openHist?.first_name} {openHist?.last_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            Rolling 3 months of tracked activity. <b>Minutes</b> comes from active-page heartbeats.
          </p>

          {histLoading && (
            <div className="py-10 text-center text-sm text-slate-400">Loading activity…</div>
          )}

          {!histLoading && histData && (
            <div className="space-y-6 max-h-[65vh] overflow-y-auto">
              {/* Monthly summary */}
              <div>
                <h3 className="font-heading text-sm font-semibold text-slate-800 mb-2 uppercase tracking-wider">Monthly</h3>
                <div className="grid grid-cols-3 gap-3">
                  {histData.months.map((m) => (
                    <div key={m.key} className="border border-slate-200 rounded-md p-3 bg-slate-50" data-testid={`hist-month-${m.key}`}>
                      <div className="text-xs text-slate-500 uppercase tracking-wide">{m.label}</div>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-lg font-semibold text-slate-900">{Math.floor(m.minutes / 60)}h</span>
                        <span className="text-sm text-slate-600">{m.minutes % 60}m</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1.5 space-y-0.5">
                        <div>{m.calls} calls · {m.notes} notes</div>
                        <div>{m.appointments_set} appt · {m.completes} closed</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly table */}
              <div>
                <h3 className="font-heading text-sm font-semibold text-slate-800 mb-2 uppercase tracking-wider">Last 12 weeks</h3>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full crm-table">
                    <thead>
                      <tr className="text-left">
                        <th className="px-3 py-2">Week</th>
                        <th className="px-3 py-2 text-right">Time worked</th>
                        <th className="px-3 py-2 text-right">Calls</th>
                        <th className="px-3 py-2 text-right">Notes</th>
                        <th className="px-3 py-2 text-right">Appts</th>
                        <th className="px-3 py-2 text-right">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...histData.weeks].reverse().map((w) => (
                        <tr key={w.key} data-testid={`hist-week-${w.key}`}>
                          <td className="px-3 py-2 text-xs text-slate-700">{w.label}</td>
                          <td className="px-3 py-2 text-xs text-right text-slate-900 font-medium">
                            {Math.floor(w.minutes / 60)}h {w.minutes % 60}m
                          </td>
                          <td className="px-3 py-2 text-xs text-right text-slate-700">{w.calls}</td>
                          <td className="px-3 py-2 text-xs text-right text-slate-700">{w.notes}</td>
                          <td className="px-3 py-2 text-xs text-right text-slate-700">{w.appointments_set}</td>
                          <td className="px-3 py-2 text-xs text-right text-emerald-700 font-medium">{w.completes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-3">
            <Button onClick={() => setOpenHist(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="hist-close">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
