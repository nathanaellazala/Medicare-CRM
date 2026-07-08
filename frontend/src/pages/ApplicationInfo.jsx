import React, { useState, useEffect } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Stethoscope, Heart } from "lucide-react";
import { toast } from "sonner";

const CONDITIONS = [
  "Diabetes",
  "High cholesterol",
  "High blood pressure",
  "Arthritis",
  "Osteoporosis",
  "Asthma",
  "COPD",
  "Heart disease",
  "Cancer (past or current)",
  "Kidney disease",
  "Depression",
  "Anxiety",
];

export default function ApplicationInfo({ lead, onSaved }) {
  const [app, setApp] = useState({
    doctor_name: "",
    marital_status: "single",
    income_under_threshold: null,
  });
  const [hra, setHra] = useState({
    height: "",
    weight: "",
    conditions: [],
    other_conditions: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setApp({
      doctor_name: lead?.application_info?.doctor_name || "",
      marital_status: lead?.application_info?.marital_status || "single",
      income_under_threshold: lead?.application_info?.income_under_threshold ?? null,
    });
    setHra({
      height: lead?.hra_info?.height || "",
      weight: lead?.hra_info?.weight || "",
      conditions: lead?.hra_info?.conditions || [],
      other_conditions: lead?.hra_info?.other_conditions || "",
    });
  }, [lead?.id]);

  const toggle = (c) => {
    setHra((h) => ({
      ...h,
      conditions: h.conditions.includes(c) ? h.conditions.filter((x) => x !== c) : [...h.conditions, c],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/leads/${lead.id}`, { application_info: app, hra_info: hra });
      toast.success("Application info saved");
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const incomeLabel = app.marital_status === "married"
    ? "Do they make less than $3,300/month?"
    : "Do they make less than $2,400/month?";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Stethoscope size={15} className="text-[#026AA2]"/>
          <h3 className="font-heading text-sm font-semibold text-slate-900">Application Details</h3>
          <span className="text-xs text-slate-400">— fill after completing the sale</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Doctor's name</Label>
            <Input value={app.doctor_name} onChange={(e) => setApp({ ...app, doctor_name: e.target.value })} className="mt-1.5" data-testid="app-doctor"/>
          </div>
          <div>
            <Label className="text-xs">Marital status</Label>
            <Select value={app.marital_status} onValueChange={(v) => setApp({ ...app, marital_status: v })}>
              <SelectTrigger className="mt-1.5" data-testid="app-marital"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">{incomeLabel}</Label>
            <div className="flex gap-2 mt-1.5">
              {[
                { v: true, l: "Yes" },
                { v: false, l: "No" },
              ].map((opt) => (
                <button
                  key={opt.l}
                  type="button"
                  onClick={() => setApp({ ...app, income_under_threshold: opt.v })}
                  data-testid={`app-income-${opt.l.toLowerCase()}`}
                  className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                    app.income_under_threshold === opt.v
                      ? "border-[#026AA2] bg-sky-50 text-[#026AA2]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-5 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Heart size={15} className="text-red-500"/>
          <h3 className="font-heading text-sm font-semibold text-slate-900">Health Risk Assessment (HRA)</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs">Height</Label>
            <Input placeholder="e.g. 5'7&quot;" value={hra.height} onChange={(e) => setHra({ ...hra, height: e.target.value })} className="mt-1.5" data-testid="hra-height"/>
          </div>
          <div>
            <Label className="text-xs">Weight</Label>
            <Input placeholder="e.g. 165 lb" value={hra.weight} onChange={(e) => setHra({ ...hra, weight: e.target.value })} className="mt-1.5" data-testid="hra-weight"/>
          </div>
        </div>
        <Label className="text-xs">Health conditions</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
          {CONDITIONS.map((c) => (
            <label key={c}
                   className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer transition-colors ${
                     hra.conditions.includes(c) ? "border-[#026AA2] bg-sky-50/50" : "border-slate-200 hover:bg-slate-50"
                   }`}>
              <Checkbox checked={hra.conditions.includes(c)} onCheckedChange={() => toggle(c)} data-testid={`hra-cond-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`}/>
              <span className="text-sm text-slate-800">{c}</span>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <Label className="text-xs">Other conditions / notes</Label>
          <Input value={hra.other_conditions} onChange={(e) => setHra({ ...hra, other_conditions: e.target.value })} className="mt-1.5" data-testid="hra-other"/>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="text-white" style={{ background: "#026AA2" }} data-testid="app-save">
          <Save size={13} className="mr-1.5"/> {saving ? "Saving..." : "Save application info"}
        </Button>
      </div>
    </div>
  );
}
