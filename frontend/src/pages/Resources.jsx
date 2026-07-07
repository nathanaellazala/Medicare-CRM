import React from "react";
import { Card } from "@/components/ui/card";
import { BookOpen, Sparkles, Wrench, Video } from "lucide-react";

export default function Resources() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Agent Tools</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Resources</h1>
        <p className="text-sm text-slate-500 mt-1">Training material, scripts, and reference guides for the team.</p>
      </div>

      <Card className="p-12 border-slate-200 rounded-md shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center mx-auto mb-5">
          <Sparkles size={26} className="text-[#026AA2]"/>
        </div>
        <div className="font-heading text-xl font-semibold text-slate-900 mb-2">Coming Soon</div>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          We're building a knowledge hub with call scripts, plan comparison charts, objection handling guides,
          and video walkthroughs. It'll live right here.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
          {[
            { icon: BookOpen, title: "Call Scripts", desc: "Opening lines, objection responses, closing techniques" },
            { icon: Wrench, title: "Plan Guides", desc: "Side-by-side comparisons of Medicare & Medicaid plans" },
            { icon: Video, title: "Video Training", desc: "Recorded sessions and best-practice playbooks" },
          ].map((it) => (
            <div key={it.title} className="p-4 rounded-md border border-slate-200 bg-slate-50/60">
              <it.icon size={18} className="text-[#026AA2] mb-2"/>
              <div className="font-semibold text-sm text-slate-900 mb-1">{it.title}</div>
              <div className="text-xs text-slate-500">{it.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
