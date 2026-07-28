import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Search, Lock, LockOpen, ChevronRight, Radio } from "lucide-react";
import { toast } from "sonner";

export default function SharedLeads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      const { data } = await api.get("/shared-leads", { params });
      setItems(data.items);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  // Auto-refresh every 15s so lock state stays fresh
  useEffect(() => {
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  const openLead = async (lead) => {
    if (lead.is_locked) {
      toast.error(`Locked by ${lead.locked_by_name || "another agent"}. Try again in a few minutes.`);
      return;
    }
    setClaiming(lead.id);
    try {
      await api.post(`/shared-leads/${lead.id}/lock`);
      navigate(`/shared-leads/${lead.id}`);
    } catch (e) {
      if (e.response?.status === 423) {
        toast.error(e.response?.data?.detail || "This lead was just claimed by someone else. Refreshing…");
        load();
      } else {
        toast.error(formatApiError(e.response?.data?.detail));
      }
    } finally { setClaiming(null); }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-5">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
          <Radio size={13} className="text-[#026AA2]"/> Shared pool
        </div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Shared Leads</h1>
        <p className="text-sm text-slate-500 mt-1">
          Open a member to claim it — only one agent can work a shared lead at a time.
          You'll see their full profile once claimed; the lock releases when you leave.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shared members by name, city, plan..."
            className="pl-9 h-9"
            data-testid="shared-search"
          />
        </div>
      </div>

      <Card className="p-0 border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full crm-table">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400 text-sm">Loading shared pool…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-14 text-slate-400">
                    <Users size={28} className="mx-auto mb-2 text-slate-300"/>
                    <div className="text-sm font-medium text-slate-600">No shared leads right now.</div>
                    <div className="text-xs">The owner can add leads to the shared pool from the Leads page.</div>
                  </td>
                </tr>
              )}
              {!loading && items.map((lead) => {
                const locked = lead.is_locked;
                const mine = lead.locked_by_me;
                return (
                  <tr key={lead.id}
                      data-testid={`shared-row-${lead.id}`}
                      onClick={() => openLead(lead)}
                      className={`${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900" data-testid={`shared-name-${lead.id}`}>
                      {lead.full_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{lead.address || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{lead.plan || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs">
                      {mine ? (
                        <span className="inline-flex items-center gap-1 text-[#026AA2] font-medium" data-testid={`shared-mine-${lead.id}`}>
                          <LockOpen size={11}/> Held by you
                        </span>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium" data-testid={`shared-locked-${lead.id}`}>
                          <Lock size={11}/> In use by {lead.locked_by_name || "another agent"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium" data-testid={`shared-avail-${lead.id}`}>
                          <LockOpen size={11}/> Available
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      {claiming === lead.id ? (
                        <span className="text-[10px] text-[#026AA2]">Opening…</span>
                      ) : (
                        !locked && <ChevronRight size={14}/>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
