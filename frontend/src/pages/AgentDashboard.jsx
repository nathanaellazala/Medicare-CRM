import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Phone, Calendar, CheckCircle2, PhoneOff, BarChart3 } from "lucide-react";

function KPI({ icon: Icon, label, value, accent = "#026AA2", testid }) {
  return (
    <div data-testid={testid} className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">{label}</div>
          <div className="font-heading text-2xl font-semibold text-slate-900">{value ?? 0}</div>
        </div>
        <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: accent + "15", color: accent }}>
          <Icon size={17}/>
        </div>
      </div>
    </div>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/agent").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="p-8 text-slate-500 text-sm">Loading dashboard...</div>;
  const c = data.cards;

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Agent Workspace</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Hello {user?.first_name}</h1>
          <p className="text-sm text-slate-500 mt-1">Your personal performance & today's queue.</p>
        </div>
        <Button onClick={() => navigate("/my-leads")} className="h-9 text-white" style={{ background: "#026AA2" }} data-testid="agent-open-leads">
          Open My Leads
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <KPI icon={Users} label="My Leads" value={c.total_leads} testid="kpi-mine"/>
        <KPI icon={Phone} label="Uncalled" value={c.uncalled} accent="#64748B" testid="kpi-uncalled"/>
        <KPI icon={PhoneOff} label="No Answer" value={c.no_answer} accent="#854D0E" testid="kpi-noans"/>
        <KPI icon={Calendar} label="Appointments" value={c.appointment_set} accent="#7E22CE" testid="kpi-appt"/>
        <KPI icon={CheckCircle2} label="Sold" value={c.sold} accent="#15803D" testid="kpi-sold"/>
        <KPI icon={BarChart3} label="Calls Today" value={c.calls_today} accent="#026AA2" testid="kpi-calls-today"/>
        <KPI icon={BarChart3} label="Calls Week" value={c.calls_week} accent="#026AA2" testid="kpi-calls-week"/>
      </div>

      <Card className="p-6 border-slate-200 rounded-md shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900 mb-2">Quick start</h2>
        <p className="text-sm text-slate-500 mb-4">Jump right back into working your assigned leads.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => navigate("/my-leads?status=Uncalled")} data-testid="quick-uncalled"
                  className="text-left p-4 rounded-md border border-slate-200 hover:border-[#026AA2] hover:bg-sky-50 transition-colors">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Work Queue</div>
            <div className="font-heading font-semibold text-slate-900">Start with Uncalled</div>
            <div className="text-xs text-slate-500 mt-1">{c.uncalled} leads waiting</div>
          </button>
          <button onClick={() => navigate("/my-leads?status=Call Back Later")} data-testid="quick-callback"
                  className="text-left p-4 rounded-md border border-slate-200 hover:border-[#026AA2] hover:bg-sky-50 transition-colors">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Follow-ups</div>
            <div className="font-heading font-semibold text-slate-900">Call Back Later</div>
            <div className="text-xs text-slate-500 mt-1">Scheduled callbacks</div>
          </button>
          <button onClick={() => navigate("/leaderboard")} data-testid="quick-leaderboard"
                  className="text-left p-4 rounded-md border border-slate-200 hover:border-[#026AA2] hover:bg-sky-50 transition-colors">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Compete</div>
            <div className="font-heading font-semibold text-slate-900">View Leaderboard</div>
            <div className="text-xs text-slate-500 mt-1">See top performers</div>
          </button>
        </div>
      </Card>
    </div>
  );
}
