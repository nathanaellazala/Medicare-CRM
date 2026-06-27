import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Merge, X } from "lucide-react";
import { toast } from "sonner";

export default function Duplicates() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/duplicates");
      setGroups(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const mergeGroup = async (group, keepId) => {
    const deleteIds = group.leads.map((l) => l.id).filter((id) => id !== keepId);
    try {
      await api.post("/duplicates/merge", { keep_id: keepId, delete_ids: deleteIds });
      toast.success(`Merged ${deleteIds.length} into kept record`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">Data Hygiene</div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Duplicate leads</h1>
        <p className="text-sm text-slate-500 mt-1">Records sharing the same normalized phone number.</p>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading...</div>}
      {!loading && groups.length === 0 && (
        <Card className="p-10 text-center border-slate-200 rounded-md shadow-sm">
          <Copy size={28} className="mx-auto text-slate-300 mb-3"/>
          <div className="font-heading font-semibold text-slate-900 mb-1">No duplicates detected</div>
          <div className="text-sm text-slate-500">All your leads have unique phone numbers.</div>
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.key} className="p-5 border-slate-200 rounded-md shadow-sm" data-testid={`dup-group-${g.key}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Phone match</div>
                <div className="font-heading text-base font-semibold text-slate-900">{g.key} · {g.count} records</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.leads.map((l) => (
                <div key={l.id} className="border border-slate-200 rounded-md p-3 hover:border-[#026AA2] transition-colors">
                  <div className="font-medium text-sm text-slate-900">{l.full_name || "Unnamed"}</div>
                  <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                    <div>{l.phone_number}</div>
                    <div>{l.city}, {l.state}</div>
                    <div>Status: {l.lead_status}</div>
                    <div>Created: {l.created_at ? new Date(l.created_at).toLocaleDateString() : ""}</div>
                  </div>
                  <Button
                    onClick={() => mergeGroup(g, l.id)}
                    className="w-full mt-3 h-8 text-xs text-white"
                    style={{ background: "#026AA2" }}
                    data-testid={`keep-${l.id}`}
                  >
                    <Merge size={12} className="mr-1.5"/> Keep this, merge others
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
