import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy, Medal, Award, TrendingUp, TrendingDown, Minus, Flame,
  ChevronLeft, ChevronRight, Crown, Target, Zap,
} from "lucide-react";

const PODIUM = [
  { icon: Crown, ring: "#F59E0B", bg: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)", label: "1st" },
  { icon: Medal, ring: "#94A3B8", bg: "linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)", label: "2nd" },
  { icon: Award, ring: "#B45309", bg: "linear-gradient(135deg, #FED7AA 0%, #FDBA74 100%)", label: "3rd" },
];

function Movement({ mv, change }) {
  if (mv === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600" title={`Up ${change} from last period`}>
        <TrendingUp size={13} /> {change}
      </span>
    );
  }
  if (mv === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500" title={`Down ${Math.abs(change)} from last period`}>
        <TrendingDown size={13} /> {Math.abs(change)}
      </span>
    );
  }
  if (mv === "new") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600" title="New this period">
        <Zap size={12} /> NEW
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="No change">
      <Minus size={13} />
    </span>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState("week");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ rows: [], label: "" });

  useEffect(() => {
    api.get("/leaderboard", { params: { period, offset } })
      .then((r) => setData(r.data))
      .catch(() => setData({ rows: [], label: "" }));
  }, [period, offset]);

  useEffect(() => { setOffset(0); }, [period]);

  const top3 = data.rows.slice(0, 3);
  const rest = data.rows.slice(3);
  const topSold = data.rows[0]?.sold || 1;
  const totalSold = data.rows.reduce((s, r) => s + (r.sold || 0), 0);
  const totalAppts = data.rows.reduce((s, r) => s + (r.appointments || 0), 0);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Performance</div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900 flex items-center gap-2">
            Leaderboard <Flame size={22} className="text-orange-500"/>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Ranked by sales. Compete, climb, close.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList className="bg-slate-100 h-9" data-testid="lb-period-tabs">
              <TabsTrigger value="today" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-[#026AA2] data-[state=active]:shadow-sm" data-testid="period-today">Daily</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-[#026AA2] data-[state=active]:shadow-sm" data-testid="period-week">Weekly</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-[#026AA2] data-[state=active]:shadow-sm" data-testid="period-month">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Period Nav */}
      <div className="flex items-center justify-between mb-6 bg-white border border-slate-200 rounded-md px-4 py-2.5">
        <Button onClick={() => setOffset(offset + 1)} className="h-8 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50" data-testid="lb-prev">
          <ChevronLeft size={14} className="mr-1" /> Previous {period === "today" ? "day" : period === "week" ? "week" : "month"}
        </Button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Showing</div>
          <div className="font-heading text-base font-semibold text-slate-900" data-testid="lb-label">{data.label || "..."}</div>
        </div>
        <Button
          onClick={() => setOffset(Math.max(0, offset - 1))}
          disabled={offset === 0}
          className="h-8 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          data-testid="lb-next"
        >
          Next {period === "today" ? "day" : period === "week" ? "week" : "month"} <ChevronRight size={14} className="ml-1" />
        </Button>
      </div>

      {/* Period totals strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Total Complete</div>
          <div className="font-heading text-3xl font-semibold text-emerald-600" data-testid="lb-total-sold">{totalSold}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Total Appointments</div>
          <div className="font-heading text-3xl font-semibold text-purple-600">{totalAppts}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Agents Competing</div>
          <div className="font-heading text-3xl font-semibold text-[#026AA2]">{data.rows.length}</div>
        </div>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Reorder visually: 2nd, 1st, 3rd */}
          {[1, 0, 2].map((idx) => {
            const r = top3[idx];
            if (!r) return <div key={idx}/>;
            const P = PODIUM[idx];
            const isFirst = idx === 0;
            const heightClass = isFirst ? "md:mt-0" : "md:mt-6";
            return (
              <div key={r.agent_id} className={heightClass}>
                <Card
                  className={`p-5 rounded-lg border-2 shadow-sm relative overflow-hidden`}
                  style={{ borderColor: P.ring, background: P.bg }}
                  data-testid={`podium-${idx + 1}`}
                >
                  {/* Big rank */}
                  <div className="absolute top-3 right-3 opacity-15 font-heading font-black text-7xl" style={{ color: P.ring }}>
                    {idx + 1}
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm" style={{ color: P.ring }}>
                        <P.icon size={24} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">{P.label} Place</div>
                        <div className="font-heading font-semibold text-slate-900 text-lg leading-tight">{r.agent_name}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-md bg-white/70 p-2.5 backdrop-blur">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Complete</div>
                        <div className="font-heading text-2xl font-bold text-emerald-700">{r.sold}</div>
                      </div>
                      <div className="rounded-md bg-white/70 p-2.5 backdrop-blur">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Appts</div>
                        <div className="font-heading text-2xl font-bold text-purple-700">{r.appointments}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Conv: <strong className="text-slate-900">{r.conversion_rate}%</strong></span>
                      <Movement mv={r.movement} change={r.rank_change}/>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Ranking Table */}
      <Card className="border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <Target size={14} className="text-[#026AA2]" />
          <h2 className="font-heading text-sm font-semibold text-slate-900">Full Ranking</h2>
          <span className="text-xs text-slate-500 ml-auto">Bars scaled to leader</span>
        </div>
        {data.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No agents on the leaderboard for this period.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.rows.map((r) => {
              const pct = topSold > 0 ? Math.round((r.sold / topSold) * 100) : 0;
              const isTop = r.rank === 1;
              return (
                <div key={r.agent_id}
                     className={`px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors ${isTop ? "bg-amber-50/40" : ""}`}
                     data-testid={`lb-row-${r.agent_id}`}>
                  {/* Rank */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0 ${
                    r.rank === 1 ? "bg-amber-100 text-amber-800 border-2 border-amber-300" :
                    r.rank === 2 ? "bg-slate-100 text-slate-700 border-2 border-slate-300" :
                    r.rank === 3 ? "bg-orange-100 text-orange-800 border-2 border-orange-300" :
                    "bg-slate-50 text-slate-500 border border-slate-200"
                  }`}>
                    {r.rank}
                  </div>

                  {/* Name + movement */}
                  <div className="w-48 shrink-0">
                    <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                      {r.agent_name}
                      {isTop && <Flame size={13} className="text-orange-500" />}
                    </div>
                    <div className="mt-0.5">
                      <Movement mv={r.movement} change={r.rank_change}/>
                    </div>
                  </div>

                  {/* Progress bar of sold */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span>Sales progress</span>
                      <span className="font-semibold text-slate-900">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: r.rank === 1
                            ? "linear-gradient(90deg, #F59E0B 0%, #EF4444 100%)"
                            : r.rank <= 3
                            ? "linear-gradient(90deg, #0284C7 0%, #026AA2 100%)"
                            : "#94A3B8",
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="w-16 text-center shrink-0">
                    <div className="font-heading text-xl font-bold text-emerald-600" data-testid={`lb-sold-${r.agent_id}`}>{r.sold}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Complete</div>
                  </div>
                  <div className="w-16 text-center shrink-0">
                    <div className="font-heading text-xl font-bold text-purple-600">{r.appointments}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Appts</div>
                  </div>
                  <div className="w-16 text-center shrink-0">
                    <div className="font-heading text-xl font-bold text-slate-700">{r.conversion_rate}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Conv.</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
