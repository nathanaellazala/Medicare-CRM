import React from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, FileText, Construction } from "lucide-react";

export default function Reports() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Reports</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Detailed performance & data reports.</p>
      </div>
      <Card className="p-10 border-slate-200 rounded-md shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center mx-auto mb-4">
          <Construction size={22} className="text-[#026AA2]"/>
        </div>
        <div className="font-heading font-semibold text-slate-900 mb-1">Coming in v2</div>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Lead status, agent performance, sold, appointment, and import batch reports with CSV export
          are queued for the next iteration. The Owner Dashboard and Leaderboard already cover the core KPIs.
        </p>
      </Card>
    </div>
  );
}
