import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [company, setCompany] = useState({});
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState({ name: "", color: "slate" });

  const load = async () => {
    const [c, s] = await Promise.all([api.get("/settings/company"), api.get("/statuses")]);
    setCompany(c.data);
    setStatuses(s.data);
  };
  useEffect(() => { load(); }, []);

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
                    <button onClick={() => removeStatus(s.id)} className="text-slate-400 hover:text-red-600 text-xs ml-1" data-testid={`del-status-${s.id}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <Input placeholder="New status name" value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} data-testid="new-status-name"/>
                <Button onClick={addStatus} className="text-white shrink-0" style={{ background: "#026AA2" }} data-testid="add-status">
                  <Plus size={14} className="mr-1.5"/> Add
                </Button>
              </div>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="profile">
          <Card className="p-6 border-slate-200 rounded-md shadow-sm mb-5">
            <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">My profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={`${user?.first_name} ${user?.last_name}`} disabled className="mt-1.5"/>
              </div>
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
        {isOwner && (
          <TabsContent value="statuses">
            <Card className="p-6 border-slate-200 rounded-md shadow-sm">
              <h2 className="font-heading text-base font-semibold text-slate-900 mb-1">Lead statuses</h2>
              <p className="text-xs text-slate-500 mb-4">Add or remove statuses agents can apply to leads.</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {statuses.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 border border-slate-200 rounded-md px-2 py-1.5 bg-white">
                    <StatusBadge status={s.name}/>
                    <button onClick={() => removeStatus(s.id)} className="text-slate-400 hover:text-red-600 text-xs ml-1" data-testid={`del-status-${s.id}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <Input placeholder="New status name" value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} data-testid="new-status-name"/>
                <Button onClick={addStatus} className="text-white shrink-0" style={{ background: "#026AA2" }} data-testid="add-status">
                  <Plus size={14} className="mr-1.5"/> Add
                </Button>
              </div>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="profile">
          <Card className="p-6 border-slate-200 rounded-md shadow-sm">
            <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">My profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={`${user?.first_name} ${user?.last_name}`} disabled className="mt-1.5"/>
              </div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
