import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, Power, CheckCircle } from "lucide-react";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openReset, setOpenReset] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");

  const load = async () => {
    const { data } = await api.get("/users");
    setAgents(data);
  };
  useEffect(() => { load(); }, []);

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
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} data-testid={`agent-row-${a.id}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{a.first_name} {a.last_name}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{a.email}</td>
                <td className="px-4 py-3 text-sm text-slate-700 capitalize">{a.role}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    a.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>{a.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
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
            ))}
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
    </div>
  );
}
