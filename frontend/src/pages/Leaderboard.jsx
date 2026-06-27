import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Award } from "lucide-react";

const MEDALS = [
  { icon: Trophy, color: "#F59E0B", bg: "#FEF3C7" },
  { icon: Medal, color: "#94A3B8", bg: "#F1F5F9" },
  { icon: Award, color: "#B45309", bg: "#FED7AA" },
];

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState("week");

  useEffect(() => {
    api.get("/leaderboard", { params: { range } }).then((r) => setRows(r.data)).catch(() => {});
  }, [range]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Performance</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Leaderboard</h1>
          <p className="text-sm text-slate-500 mt-1">Top-performing agents ranked by sales & activity.</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-9 w-36" data-testid="lb-range"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top 3 podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {rows.slice(0, 3).map((r, i) => {
          const M = MEDALS[i];
          return (
            <Card key={r.agent_id} className={`p-5 border-2 rounded-md shadow-sm`}
                  style={{ borderColor: M.color }}
                  data-testid={`podium-${i + 1}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: M.bg, color: M.color }}>
                  <M.icon size={20}/>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rank #{r.rank}</div>
                  <div className="font-heading font-semibold text-slate-900">{r.agent_name}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="font-heading text-xl font-semibold text-slate-900">{r.sold}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Sold</div>
                </div>
                <div>
                  <div className="font-heading text-xl font-semibold text-slate-900">{r.appointments}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Appts</div>
                </div>
                <div>
                  <div className="font-heading text-xl font-semibold text-slate-900">{r.calls}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Calls</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-0 border-slate-200 rounded-md shadow-sm overflow-hidden">
        <table className="w-full crm-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Calls</th>
              <th className="px-4 py-3">Appointments</th>
              <th className="px-4 py-3">Sold</th>
              <th className="px-4 py-3">Conv. Rate</th>
              <th className="px-4 py-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent_id} data-testid={`lb-row-${r.agent_id}`}>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900">{r.rank}</td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.agent_name}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{r.assigned}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{r.calls}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{r.appointments}</td>
                <td className="px-4 py-3 text-sm font-semibold text-green-700">{r.sold}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{r.conversion_rate}%</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.last_activity ? new Date(r.last_activity).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
