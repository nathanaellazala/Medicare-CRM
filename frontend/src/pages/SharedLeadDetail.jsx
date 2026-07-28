import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, formatBirthdate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Lock, Unlock, Phone, MapPin, IdCard, Cross, FileText, User as UserIcon } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

// Heartbeat every 60s to keep the lock alive while the tab is open
const HEARTBEAT_INTERVAL_MS = 60_000;

export default function SharedLeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const releasedRef = useRef(false);

  // Attempt lock + load data on mount. If lock fails, bounce back.
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        // Try to acquire (idempotent — succeeds if we already hold it)
        await api.post(`/shared-leads/${id}/lock`);
        if (cancelled) return;
        const [{ data: leadData }, { data: statusData }] = await Promise.all([
          api.get(`/shared-leads/${id}`),
          api.get("/statuses"),
        ]);
        setLead(leadData);
        setStatuses(statusData);
      } catch (e) {
        if (e.response?.status === 423) {
          toast.error(e.response?.data?.detail || "Someone else is working this lead — try again shortly.");
        } else if (e.response?.status === 404) {
          toast.error("Shared lead not found — it may have been claimed and completed.");
        } else {
          toast.error(formatApiError(e.response?.data?.detail));
        }
        navigate("/shared-leads");
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [id]);

  // Heartbeat while page is open
  useEffect(() => {
    if (!lead) return;
    const iv = setInterval(() => {
      api.post(`/shared-leads/${id}/heartbeat`).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [id, lead]);

  // Release the lock on unmount (navigation away, tab close)
  useEffect(() => {
    const release = () => {
      if (releasedRef.current) return;
      releasedRef.current = true;
      // fetch with keepalive works during page-unload and still sends auth header
      try {
        const url = `${process.env.REACT_APP_BACKEND_URL}/api/shared-leads/${id}/unlock`;
        const token = localStorage.getItem("access_token") || "";
        fetch(url, {
          method: "POST",
          keepalive: true,
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => {});
      } catch (e) { /* best effort */ }
    };
    window.addEventListener("beforeunload", release);
    return () => {
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [id]);

  const releaseAndLeave = async () => {
    if (releasing) return;
    setReleasing(true);
    try {
      await api.post(`/shared-leads/${id}/unlock`);
      releasedRef.current = true;
    } catch (e) { /* non-fatal */ }
    navigate("/shared-leads");
  };

  const updateStatus = async (newStatus) => {
    try {
      await api.patch(`/shared-leads/${id}`, { lead_status: newStatus });
      setLead((l) => ({ ...l, lead_status: newStatus }));
      toast.success("Status updated");
      // Complete = win recorded, lead leaves the shared pool
      if (newStatus === "Complete") {
        releasedRef.current = true; // backend already cleared the lock
        toast.success("Nice — win recorded. Returning to the shared pool.");
        setTimeout(() => navigate("/shared-leads"), 400);
      }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm">Claiming shared lead…</div>;
  }
  if (!lead) return null;

  const addressParts = [lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <button
            onClick={releaseAndLeave}
            className="text-xs text-slate-500 hover:text-[#026AA2] inline-flex items-center gap-1 mb-2"
            data-testid="shared-back"
          >
            <ArrowLeft size={12}/> Back to shared pool (releases your lock)
          </button>
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 mb-1 inline-flex items-center gap-1.5">
            <Unlock size={11}/> You have this lead claimed
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900" data-testid="shared-title">
            {lead.full_name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.lead_status}/>
          <Button
            onClick={releaseAndLeave}
            className="h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            data-testid="shared-release"
          >
            <Lock size={13} className="mr-1.5"/> Release lock
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="md:col-span-2 p-6 border-slate-200 rounded-md shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <UserIcon size={15} className="text-[#026AA2]"/> Member details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow icon={<Phone size={13}/>} label="Phone" value={lead.phone_number}/>
            <InfoRow icon={<Phone size={13}/>} label="Other phone" value={lead.other_phone_number}/>
            <InfoRow icon={<UserIcon size={13}/>} label="DOB" value={formatBirthdate(lead.birthdate)}/>
            <InfoRow icon={<MapPin size={13}/>} label="Address" value={addressParts.join(", ")}/>
            <InfoRow icon={<MapPin size={13}/>} label="County" value={lead.county}/>
            <InfoRow icon={<IdCard size={13}/>} label="Medicare #" value={lead.medicare_number}/>
            <InfoRow icon={<Cross size={13}/>} label="Medicaid #" value={lead.medicaid_number}/>
            <InfoRow icon={<FileText size={13}/>} label="Medicare parts" value={lead.medicare_parts}/>
            <InfoRow icon={<FileText size={13}/>} label="Medicaid provider" value={lead.medicaid_provider}/>
            <InfoRow icon={<FileText size={13}/>} label="Lead type" value={lead.lead_type}/>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 border-slate-200 rounded-md shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">Status</div>
            <Select value={lead.lead_status || "Uncalled"} onValueChange={updateStatus}>
              <SelectTrigger data-testid="shared-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 mt-3">
              Setting the status to <b>Complete</b> records the win and releases the lead from the shared pool automatically.
            </p>
          </Card>

          <Card className="p-5 border-amber-200 bg-amber-50 rounded-md shadow-sm">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-medium mb-1.5">
              <Lock size={12}/> Shared-pool etiquette
            </div>
            <p className="text-[12px] text-amber-800/90 leading-relaxed">
              Please only keep this lead open while you're actively working it —
              your lock auto-expires after 5 minutes of inactivity, but leaving
              it open blocks teammates.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1">
        {icon} {label}
      </div>
      <div className="text-sm text-slate-900 break-words">
        {value || <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}
