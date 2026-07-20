import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Save, Sun, Moon, KeyRound, Palette } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const { theme, setTheme } = useTheme();
  const [company, setCompany] = useState({});
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState({ name: "", color: "slate" });

  const load = async () => {
    try {
      if (isOwner) {
        const [c, s] = await Promise.all([api.get("/settings/company"), api.get("/statuses")]);
        setCompany(c.data);
        setStatuses(s.data);
      } else {
        const s = await api.get("/statuses");
        setStatuses(s.data);
      }
    } catch (e) { /* non-fatal */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const saveCompany = async () => {
    try {
      await api.patch("/settings/company", company);
      toast.success("Company settings saved");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addStatus = async () => {
    if (!newStatus.name) return;
    try {
      await api.post("/statuses", { ...newStatus, sort_order: statuses.length + 1, is_active: true });
      toast.success("Status added");
      setNewStatus({ name: "", color: "slate" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const removeStatus = async (id) => {
    try {
      await api.delete(`/statuses/${id}`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Configuration</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Settings</h1>
      </div>

      <Tabs defaultValue={isOwner ? "company" : "profile"}>
        <TabsList className="bg-white border border-slate-200 mb-5">
          {isOwner && <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>}
          {isOwner && <TabsTrigger value="statuses" data-testid="tab-statuses">Lead statuses</TabsTrigger>}
          <TabsTrigger value="appearance" data-testid="tab-appearance">Appearance</TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">My profile</TabsTrigger>
        </TabsList>

        {isOwner && (
          <TabsContent value="company">
            <Card className="p-6 border-slate-200 rounded-md shadow-sm">
              <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">Company profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Company name</Label>
                  <Input value={company.company_name || ""} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} className="mt-1.5" data-testid="company-name"/>
                </div>
                <div>
                  <Label className="text-xs">CRM name</Label>
                  <Input value={company.crm_name || ""} onChange={(e) => setCompany({ ...company, crm_name: e.target.value })} className="mt-1.5"/>
                </div>
                <div>
                  <Label className="text-xs">Contact email</Label>
                  <Input value={company.contact_email || ""} onChange={(e) => setCompany({ ...company, contact_email: e.target.value })} className="mt-1.5"/>
                </div>
                <div>
                  <Label className="text-xs">Contact phone</Label>
                  <Input value={company.contact_phone || ""} onChange={(e) => setCompany({ ...company, contact_phone: e.target.value })} className="mt-1.5"/>
                </div>
                <div>
                  <Label className="text-xs">Primary color</Label>
                  <Input value={company.primary_color || ""} onChange={(e) => setCompany({ ...company, primary_color: e.target.value })} className="mt-1.5"/>
                </div>
                <div>
                  <Label className="text-xs">Logo URL</Label>
                  <Input value={company.logo_url || ""} onChange={(e) => setCompany({ ...company, logo_url: e.target.value })} className="mt-1.5"/>
                </div>
              </div>
              <Button onClick={saveCompany} className="mt-5 text-white" style={{ background: "#026AA2" }} data-testid="save-company">
                <Save size={14} className="mr-1.5"/> Save changes
              </Button>
            </Card>
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="statuses">
            <Card className="p-6 border-slate-200 rounded-md shadow-sm">
              <h2 className="font-heading text-base font-semibold text-slate-900 mb-1">Lead statuses</h2>
              <p className="text-xs text-slate-500 mb-4">Add or remove statuses agents can apply to leads.</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {statuses.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 border border-slate-200 rounded-md px-2 py-1.5 bg-white">
                    <StatusBadge status={s.name}/>
                    {s.is_default ? (
                      <span
                        className="text-slate-300 text-[10px] ml-1 uppercase tracking-wider"
                        title="System status — cannot be deleted"
                        data-testid={`locked-status-${s.id}`}
                      >
                        LOCKED
                      </span>
                    ) : (
                      <button
                        onClick={() => removeStatus(s.id)}
                        className="text-slate-400 hover:text-red-600 text-xs ml-1"
                        data-testid={`del-status-${s.id}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                <span className="uppercase tracking-wider text-slate-400 font-medium">Locked</span> statuses are used by core features (Book of Business, dashboard funnel, leaderboard) and can't be removed.
              </p>
              <div className="flex gap-2 max-w-md">
                <Input placeholder="New status name" value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} data-testid="new-status-name"/>
                <Button onClick={addStatus} className="text-white shrink-0" style={{ background: "#026AA2" }} data-testid="add-status">
                  <Plus size={14} className="mr-1.5"/> Add
                </Button>
              </div>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="appearance">
          <Card className="p-6 border-slate-200 rounded-md shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Palette size={16} className="text-[#026AA2]"/>
              <h2 className="font-heading text-base font-semibold text-slate-900">Appearance</h2>
            </div>
            <p className="text-xs text-slate-500 mb-5">Choose how HN CRM looks on this device.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
              <button
                type="button"
                onClick={() => setTheme("light")}
                data-testid="theme-light"
                className={`text-left p-4 rounded-md border-2 transition-all ${
                  theme === "light"
                    ? "border-[#026AA2] bg-sky-50/50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sun size={16} className="text-amber-500"/>
                  <span className="font-medium text-slate-900 text-sm">Light</span>
                  {theme === "light" && <span className="ml-auto text-[10px] uppercase tracking-wider text-[#026AA2] font-semibold">Active</span>}
                </div>
                <div className="h-16 rounded border border-slate-200 bg-gradient-to-br from-white to-slate-50 flex items-center justify-center">
                  <div className="w-24 h-2 bg-slate-200 rounded"></div>
                </div>
                <p className="text-xs text-slate-500 mt-2.5">Clean and bright — perfect for daylight.</p>
              </button>

              <button
                type="button"
                onClick={() => setTheme("dark")}
                data-testid="theme-dark"
                className={`text-left p-4 rounded-md border-2 transition-all ${
                  theme === "dark"
                    ? "border-sky-400 bg-sky-50/50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Moon size={16} className="text-indigo-500"/>
                  <span className="font-medium text-slate-900 text-sm">Dark</span>
                  {theme === "dark" && <span className="ml-auto text-[10px] uppercase tracking-wider text-sky-500 font-semibold">Active</span>}
                </div>
                <div className="h-16 rounded border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                  <div className="w-24 h-2 bg-slate-600 rounded"></div>
                </div>
                <p className="text-xs text-slate-500 mt-2.5">Easier on the eyes for evening calls.</p>
              </button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <NameCard/>

          <Card className="p-6 border-slate-200 rounded-md shadow-sm mb-5">
            <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">Account details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={user?.email || ""} disabled className="mt-1.5"/>
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Input value={user?.role || ""} disabled className="mt-1.5 capitalize"/>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Input value={user?.status || ""} disabled className="mt-1.5"/>
              </div>
            </div>
          </Card>

          <ChangePasswordCard/>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NameCard() {
  const { user, refresh } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(user?.first_name || "");
    setLastName(user?.last_name || "");
  }, [user?.first_name, user?.last_name]);

  const submit = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) return toast.error("First and last name are required");
    setSaving(true);
    try {
      await api.patch("/users/me", { first_name: fn, last_name: ln });
      await refresh();
      toast.success("Name updated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const dirty = firstName.trim() !== (user?.first_name || "") || lastName.trim() !== (user?.last_name || "");

  return (
    <Card className="p-6 border-slate-200 rounded-md shadow-sm mb-5">
      <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">Your name</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <Label className="text-xs">First name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5" data-testid="my-first-name"/>
        </div>
        <div>
          <Label className="text-xs">Last name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5" data-testid="my-last-name"/>
        </div>
      </div>
      <Button onClick={submit} disabled={saving || !dirty} className="mt-5 text-white disabled:opacity-50" style={{ background: "#026AA2" }} data-testid="save-my-name">
        {saving ? "Saving…" : "Save name"}
      </Button>
    </Card>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!current || !next || !confirm) return toast.error("All fields are required");
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("New passwords don't match");
    setSaving(true);
    try {
      await api.post("/users/me/change-password", { current_password: current, new_password: next });
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  return (
    <Card className="p-6 border-slate-200 rounded-md shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={16} className="text-[#026AA2]"/>
        <h2 className="font-heading text-base font-semibold text-slate-900">Change password</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        <div>
          <Label className="text-xs">Current password</Label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1.5" data-testid="cur-pass"/>
        </div>
        <div>
          <Label className="text-xs">New password</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5" data-testid="new-pass"/>
        </div>
        <div>
          <Label className="text-xs">Confirm new password</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" data-testid="confirm-pass"/>
        </div>
      </div>
      <Button onClick={submit} disabled={saving} className="mt-5 text-white" style={{ background: "#026AA2" }} data-testid="save-password">
        {saving ? "Saving…" : "Change password"}
      </Button>
    </Card>
  );
}
