import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shuffle, UserCheck } from "lucide-react";
import { toast } from "sonner";

export default function AssignLeads() {
  const [agents, setAgents] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [singleAgent, setSingleAgent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, l] = await Promise.all([
      api.get("/users"),
      api.get("/leads", { params: { agent_id: "unassigned", limit: 1 } }),
    ]);
    setAgents(a.data.filter((u) => u.role === "agent" && u.status === "active"));
    setUnassignedCount(l.data.total);
  };
  useEffect(() => { load(); }, []);

  const runRoundRobin = async () => {
    if (selectedAgents.length === 0) return toast.error("Pick at least one agent");
    setBusy(true);
    try {
      const { data } = await api.post("/leads/round-robin", { lead_ids: [], agent_ids: selectedAgents });
      toast.success(`Distributed ${data.assigned} leads across ${data.agents} agents`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const assignAllToOne = async () => {
    if (!singleAgent) return toast.error("Pick an agent");
    setBusy(true);
    try {
      const { data: l } = await api.get("/leads", { params: { agent_id: "unassigned", limit: 5000 } });
      const ids = l.items.map((x) => x.id);
      if (ids.length === 0) { toast.info("No unassigned leads"); setBusy(false); return; }
      await api.post("/leads/assign", { lead_ids: ids, agent_id: singleAgent });
      toast.success(`Assigned ${ids.length} leads`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Assignment</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Assign Leads</h1>
        <p className="text-sm text-slate-500 mt-1">
          {unassignedCount} unassigned leads ready to be distributed.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-slate-200 rounded-md shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900 mb-1">Round-robin distribution</h2>
          <p className="text-xs text-slate-500 mb-4">Distribute all unassigned leads evenly across selected agents.</p>
          <div className="space-y-2 mb-4">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                <Checkbox
                  checked={selectedAgents.includes(a.id)}
                  onCheckedChange={(v) => setSelectedAgents(v ? [...selectedAgents, a.id] : selectedAgents.filter((x) => x !== a.id))}
                  data-testid={`rr-pick-${a.id}`}
                />
                <span className="text-sm text-slate-800 font-medium">{a.first_name} {a.last_name}</span>
                <span className="ml-auto text-xs text-slate-500">{a.email}</span>
              </label>
            ))}
          </div>
          <Button onClick={runRoundRobin} disabled={busy} className="w-full text-white" style={{ background: "#026AA2" }} data-testid="run-roundrobin">
            <Shuffle size={14} className="mr-2"/> Distribute {unassignedCount} leads
          </Button>
        </Card>

        <Card className="p-5 border-slate-200 rounded-md shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900 mb-1">Assign all to one agent</h2>
          <p className="text-xs text-slate-500 mb-4">Send every unassigned lead to a single agent.</p>
          <Select value={singleAgent} onValueChange={setSingleAgent}>
            <SelectTrigger className="h-10 mb-4" data-testid="single-agent-select"><SelectValue placeholder="Choose agent..."/></SelectTrigger>
            <SelectContent>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={assignAllToOne} disabled={busy} className="w-full text-white" style={{ background: "#026AA2" }} data-testid="assign-all">
            <UserCheck size={14} className="mr-2"/> Assign all
          </Button>
        </Card>
      </div>
    </div>
  );
}
