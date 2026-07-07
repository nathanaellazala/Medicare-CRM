import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, UserCheck, UserPlus, Phone, Calendar, CheckCircle2, XCircle,
  PhoneOff, Copy as CopyIcon, UserCog, Upload, Shuffle, BarChart3
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, Legend
} from "recharts";

const STATUS_COLORS = {
  "Uncalled": "#94A3B8", "No Answer": "#EAB308", "Left Voicemail": "#F97316",
  "Call Back Later": "#3B82F6", "Appointment Set": "#A855F7",
  "Application Started": "#6366F1", "Pending": "#14B8A6", "Sold": "#22C55E",
  "Not Interested": "#EF4444", "No Medicare": "#991B1B",
  "No Medicare Part B": "#991B1B", "Do Not Call": "#0F172A",
  "Wrong Number": "#EF4444", "Duplicate": "#64748B", "Ineligible": "#94A3B8",
  "Disconnected Number": "#EF4444",
};

function KPI({ icon: Icon, label, value, accent = "#026AA2", testid }) {
  return (
    <div data-testid={testid} className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            {label}
          </div>
          <div className="font-heading text-2xl font-semibold text-slate-900">{value ?? 0}</div>
        </div>
        <div className="w-9 h-9 rounded-md flex items-center justify-center"
             style={{ background: accent + "15", color: accent }}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  useEffect(() => {
    const load = () => {
      api.get("/dashboard/owner")
        .then((r) => { setData(r.data); setRefreshedAt(new Date()); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  if (!data) {
    return <div className="p-8 text-slate-500 text-sm">Loading dashboard...</div>;
  }

  const c = data.cards;
  const statusData = data.by_status.map((s) => ({ name: s.status, value: s.count, color: STATUS_COLORS[s.status] || "#64748B" }));

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Owner Workspace</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">
            Welcome back, {user?.first_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Here's how your team is performing today.
            {refreshedAt && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400">
                · Auto-refreshing · last update {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/import")} data-testid="quick-import" className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 h-9">
            <Upload size={14} className="mr-1.5" /> Import Leads
          </Button>
          <Button onClick={() => navigate("/agents")} data-testid="quick-add-agent" className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 h-9">
            <UserCog size={14} className="mr-1.5" /> Add Agent
          </Button>
          <Button onClick={() => navigate("/assign")} data-testid="quick-assign" className="h-9 text-white" style={{ background: "#026AA2" }}>
            <Shuffle size={14} className="mr-1.5" /> Assign Leads
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <KPI icon={Users} label="Total Leads" value={c.total_leads} testid="kpi-total"/>
        <KPI icon={UserPlus} label="New (7d)" value={c.new_week} accent="#0284C7" testid="kpi-new"/>
        <KPI icon={UserCheck} label="Assigned" value={c.assigned} accent="#15803D" testid="kpi-assigned"/>
        <KPI icon={Users} label="Unassigned" value={c.unassigned} accent="#C2410C" testid="kpi-unassigned"/>
        <KPI icon={Phone} label="Uncalled" value={c.uncalled} accent="#64748B" testid="kpi-uncalled"/>
        <KPI icon={Calendar} label="Appointments" value={c.appointment_set} accent="#7E22CE" testid="kpi-appt"/>
        <KPI icon={CheckCircle2} label="Complete" value={c.sold} accent="#15803D" testid="kpi-sold"/>
        <KPI icon={XCircle} label="Not Interested" value={c.not_interested} accent="#B91C1C" testid="kpi-noi"/>
        <KPI icon={PhoneOff} label="No Answer" value={c.no_answer} accent="#854D0E" testid="kpi-noans"/>
        <KPI icon={CopyIcon} label="Duplicates" value={c.duplicate} accent="#475569" testid="kpi-dup"/>
        <KPI icon={UserCog} label="Active Agents" value={c.active_agents} accent="#026AA2" testid="kpi-agents"/>
        <KPI icon={BarChart3} label="Calls This Week" value={c.calls_week} accent="#026AA2" testid="kpi-calls-week"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-2 border-slate-200 rounded-md shadow-sm">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-heading text-base font-semibold text-slate-900">Leads by Agent</h2>
            <span className="text-xs text-slate-500">Active distribution</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_agent} margin={{ left: -10 }}>
              <XAxis dataKey="agent_name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}/>
              <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E2E8F0" }}/>
              <Bar dataKey="count" fill="#026AA2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 border-slate-200 rounded-md shadow-sm">
          <div className="mb-4">
            <h2 className="font-heading text-base font-semibold text-slate-900">Leads by Status</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={75} innerRadius={45} paddingAngle={2}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E2E8F0" }}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
            {statusData.slice(0, 6).map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }}/>
                  <span className="text-slate-600">{s.name}</span>
                </div>
                <span className="font-medium text-slate-900">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Funnel */}
      <Card className="p-5 mt-5 border-slate-200 rounded-md shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900 mb-4">Conversion Funnel</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Uncalled", value: data.funnel.uncalled, color: "#94A3B8" },
            { label: "Contacted", value: data.funnel.contacted, color: "#0284C7" },
            { label: "Appointment Set", value: data.funnel.appointment_set, color: "#A855F7" },
            { label: "Complete", value: data.funnel.sold, color: "#22C55E" },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{s.label}</div>
              <div className="font-heading text-3xl font-semibold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
