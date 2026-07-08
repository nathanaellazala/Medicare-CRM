import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, Power, CheckCircle, Trophy, Circle, ShieldCheck } from "lucide-react";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openReset, setOpenReset] = useState(null);
  const [openPerms, setOpenPerms] = useState(null); // agent object
  const [permFields, setPermFields] = useState([]); // {key,label}[]
  const [permSelected, setPermSelected] = useState([]);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");

  const load = async () => {
    const { data } = await api.get("/users");
    // Enrich each user with today/week activity minutes
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

  const createAgent = async () => {
    try {
      await api.post("/users", { ...form, role: "agent" });
      toast.success("Agent created");
      setOpenCreate(false);
      setForm({ first_name: "", last_name: "", email: "", password: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleStatus = async (a) => {
    try {
      await api.patch(`/users/${a.id}`, { status: a.status === "active" ? "inactive" : "active" });
      toast.success("Updated");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleLeaderboard = async (a) => {
    try {
      await api.patch(`/users/${a.id}`, { on_leaderboard: !a.on_leaderboard });
      toast.success(a.on_leaderboard ? "Removed from leaderboard" : "Added to leaderboard");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error("Password must be 6+ chars");
    try {
      await api.post(`/users/${openReset.id}/reset-password`, { password: newPassword });
      toast.success("Password reset");
      setOpenReset(null);
      setNewPassword("");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Team</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Agents</h1>
          <p className="text-sm text-slate-500 mt-1">Manage agents, reset passwords, deactivate accounts.</p>
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
                      onClick={() => openPermissions(a)}
                      className="text-slate-900 hover:text-[#026AA2] hover:underline text-left"
                      data-testid={`agent-name-${a.id}`}
                    >
                      {a.first_name} {a.last_name}
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
                  }`}>{a.status}</span>
                </td>
                <td className="px-4 py-3">
                  {a.role === "owner" ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <button
                      onClick={() => toggleLeaderboard(a)}
                      data-testid={`lb-toggle-${a.id}`}
                      className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 hover:opacity-80 ${
                        a.on_leaderboard !== false
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      <Trophy size={10}/> {a.on_leaderboard !== false ? "Visible" : "Hidden"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {a.role !== "owner" && (
                      <Button
                        onClick={() => openPermissions(a)}
                        className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-sky-50 hover:text-[#026AA2] hover:border-[#026AA2]"
                        title="Manage access to lead fields"
                        data-testid={`perms-${a.id}`}
                      >
                        <ShieldCheck size={12}/>
                      </Button>
                    )}
                    <Button onClick={() => setOpenReset(a)} className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" data-testid={`reset-${a.id}`}>
                      <KeyRound size={12}/>
                    </Button>
                    {a.role !== "owner" && (
                      <Button onClick={() => toggleStatus(a)} className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" data-testid={`toggle-${a.id}`}>
                        <Power size={12}/>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!openReset} onOpenChange={(o) => { if (!o) setOpenReset(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {openReset?.first_name}</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">New password</Label>
            <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" data-testid="new-pass-input"/>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenReset(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={resetPassword} className="text-white" style={{ background: "#026AA2" }} data-testid="confirm-reset">Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage access modal */}
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
    </div>
  );
}
