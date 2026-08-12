import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, FileText, Plus, Trash2, Upload, ExternalLink, Building2 } from "lucide-react";

export default function PlanBrochures() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCarrier, setOpenCarrier] = useState(false);
  const [newCarrierName, setNewCarrierName] = useState("");
  const [addPlanFor, setAddPlanFor] = useState(null); // carrier id
  const [planName, setPlanName] = useState("");
  const [planFile, setPlanFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/carriers");
      setCarriers(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createCarrier = async () => {
    if (!newCarrierName.trim()) return toast.error("Carrier name required");
    try {
      await api.post("/carriers", { name: newCarrierName.trim(), sort_order: carriers.length });
      toast.success("Carrier added");
      setNewCarrierName("");
      setOpenCarrier(false);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deleteCarrier = async (c) => {
    if (!window.confirm(`Delete "${c.name}" and all of its plans? This can't be undone.`)) return;
    try {
      await api.delete(`/carriers/${c.id}`);
      toast.success("Carrier deleted");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const createPlan = async () => {
    if (!planName.trim()) return toast.error("Plan name required");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("name", planName.trim());
      if (planFile) fd.append("brochure", planFile);
      await api.post(`/carriers/${addPlanFor}/plans`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Plan added");
      setPlanName(""); setPlanFile(null); setAddPlanFor(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setUploading(false); }
  };

  const deletePlan = async (c, p) => {
    if (!window.confirm(`Delete plan "${p.name}"?`)) return;
    try {
      await api.delete(`/carriers/${c.id}/plans/${p.id}`);
      toast.success("Plan deleted");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openPdf = (p) => {
    const token = localStorage.getItem("access_token") || "";
    // Use fetch to inject auth header, then open the blob URL
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/plans/${p.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => toast.error("Couldn't open brochure"));
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
            <BookOpen size={13} className="text-[#026AA2]"/> Reference library
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Plan Brochures</h1>
          <p className="text-sm text-slate-500 mt-1">
            Look up any carrier's plan and open its official brochure PDF.
          </p>
        </div>
        {isOwner && (
          <Button
            onClick={() => setOpenCarrier(true)}
            className="h-9 text-white"
            style={{ background: "#026AA2" }}
            data-testid="carrier-add"
          >
            <Plus size={14} className="mr-1.5"/> Add carrier
          </Button>
        )}
      </div>

      {loading && <div className="text-slate-400 text-sm">Loading carriers…</div>}

      {!loading && carriers.length === 0 && (
        <Card className="p-10 text-center border-slate-200 rounded-md">
          <Building2 size={32} className="mx-auto mb-2 text-slate-300"/>
          <div className="text-sm font-medium text-slate-600">No carriers yet.</div>
          <div className="text-xs text-slate-500 mt-1">
            {isOwner ? "Click Add carrier to get started." : "Your admin hasn't added any carrier brochures yet."}
          </div>
        </Card>
      )}

      {!loading && carriers.length > 0 && (
        <Card className="p-2 border-slate-200 rounded-md">
          <Accordion type="multiple" className="w-full">
            {carriers.map((c) => (
              <AccordionItem key={c.id} value={c.id} data-testid={`carrier-${c.id}`}>
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 rounded">
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className="text-[#026AA2]"/>
                    <span className="font-medium text-slate-900" data-testid={`carrier-name-${c.id}`}>{c.name}</span>
                    <span className="text-xs text-slate-500 font-normal">
                      {c.plans.length} plan{c.plans.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="space-y-1.5 pl-6">
                    {c.plans.length === 0 && (
                      <div className="text-xs text-slate-400 py-2">No plans yet.</div>
                    )}
                    {c.plans.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-sky-50 border border-slate-100" data-testid={`plan-${p.id}`}>
                        <button
                          onClick={() => openPdf(p)}
                          disabled={!p.has_pdf}
                          className={`flex items-center gap-2 text-sm ${p.has_pdf ? "text-slate-900 hover:text-[#026AA2]" : "text-slate-400 cursor-not-allowed"}`}
                          data-testid={`plan-open-${p.id}`}
                        >
                          <FileText size={13}/>
                          {p.name}
                          {p.has_pdf ? <ExternalLink size={11} className="text-slate-400"/> : <span className="text-[10px] text-slate-400 ml-1">(no PDF uploaded)</span>}
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => deletePlan(c, p)}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Delete plan"
                            data-testid={`plan-delete-${p.id}`}
                          >
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    ))}
                    {isOwner && (
                      <div className="pt-2 flex items-center gap-2">
                        <Button
                          onClick={() => { setAddPlanFor(c.id); setPlanName(""); setPlanFile(null); }}
                          className="h-8 bg-white border border-[#026AA2] text-[#026AA2] hover:bg-sky-50 text-xs"
                          data-testid={`plan-add-${c.id}`}
                        >
                          <Plus size={11} className="mr-1"/> Add plan
                        </Button>
                        <button
                          onClick={() => deleteCarrier(c)}
                          className="text-xs text-slate-400 hover:text-red-600"
                          data-testid={`carrier-delete-${c.id}`}
                        >
                          Delete carrier
                        </button>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}

      {/* Add carrier dialog */}
      <Dialog open={openCarrier} onOpenChange={setOpenCarrier}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add insurance carrier</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">Carrier name</Label>
            <Input
              value={newCarrierName}
              onChange={(e) => setNewCarrierName(e.target.value)}
              placeholder="e.g. Humana, Aetna, UnitedHealthcare"
              onKeyDown={(e) => e.key === "Enter" && createCarrier()}
              className="mt-1.5"
              data-testid="carrier-name-input"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenCarrier(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={createCarrier} className="text-white" style={{ background: "#026AA2" }} data-testid="carrier-save">
              Add carrier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add plan dialog */}
      <Dialog open={!!addPlanFor} onOpenChange={(o) => !o && setAddPlanFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add plan — {carriers.find((x) => x.id === addPlanFor)?.name || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Plan name</Label>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="e.g. Gold Plus HMO 2026"
                className="mt-1.5"
                data-testid="plan-name-input"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Upload size={12}/> Brochure PDF <span className="text-slate-400 font-normal">(optional, max 15 MB)</span>
              </Label>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPlanFile(e.target.files?.[0] || null)}
                className="mt-1.5"
                data-testid="plan-file-input"
              />
              {planFile && (
                <div className="text-xs text-slate-600 mt-1.5">
                  Selected: <b>{planFile.name}</b> ({Math.round(planFile.size / 1024)} KB)
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setAddPlanFor(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={createPlan} disabled={uploading} className="text-white disabled:opacity-50" style={{ background: "#026AA2" }} data-testid="plan-save">
              {uploading ? "Uploading…" : "Add plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
