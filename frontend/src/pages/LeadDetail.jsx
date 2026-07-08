import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError, formatBirthdate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import ApplicationInfo from "@/pages/ApplicationInfo";
import { ArrowLeft, Phone, Copy, Plus, PhoneCall, Pin, ClipboardEdit, History, FileText, User, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";

function Field({ label, value, copyable }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-sm text-slate-900 font-medium break-words">{value || "—"}</div>
        {copyable && value && (
          <button
            onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
            className="text-slate-400 hover:text-[#026AA2] transition-colors"
            data-testid={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Copy size={12}/>
          </button>
        )}
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [agents, setAgents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [notes, setNotes] = useState([]);
  const [calls, setCalls] = useState([]);
  const [callResults, setCallResults] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [openCall, setOpenCall] = useState(false);
  const [callForm, setCallForm] = useState({ call_result: "", notes: "", follow_up_date: "", duration: "" });
  const [openAppt, setOpenAppt] = useState(false);
  const [apptForm, setApptForm] = useState({ date: "", time: "" });

  const isOwner = user?.role === "owner";

  const load = async () => {
    try {
      const [l, s, c, n, ac, cr] = await Promise.all([
        api.get(`/leads/${id}`),
        api.get("/statuses"),
        api.get(`/leads/${id}/call-logs`),
        api.get(`/leads/${id}/notes`),
        api.get(`/leads/${id}/activity`),
        api.get(`/constants/call-results`),
      ]);
      setLead(l.data);
      setStatuses(s.data);
      setCalls(c.data);
      setNotes(n.data);
      setActivity(ac.data);
      setCallResults(cr.data);
      if (isOwner) {
        const u = await api.get("/users");
        setAgents(u.data.filter((x) => x.role === "agent"));
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!lead) return <div className="p-8 text-sm text-slate-500">Loading...</div>;

  const updateField = async (field, value) => {
    // Special-case Appointment Set: prompt for date/time
    if (field === "lead_status" && value === "Appointment Set") {
      // Prefill with existing appointment if present, otherwise +1 day at 10:00
      const existing = lead?.appointment_at ? new Date(lead.appointment_at) : null;
      const base = existing || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
      setApptForm({
        date: base.toISOString().slice(0, 10),
        time: base.toTimeString().slice(0, 5),
      });
      setOpenAppt(true);
      return;
    }
    try {
      const { data } = await api.patch(`/leads/${id}`, { [field]: value });
      setLead(data);
      load();
      toast.success("Updated");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveAppointment = async () => {
    if (!apptForm.date || !apptForm.time) { toast.error("Pick date and time"); return; }
    const iso = new Date(`${apptForm.date}T${apptForm.time}`).toISOString();
    try {
      const { data } = await api.patch(`/leads/${id}`, {
        lead_status: "Appointment Set",
        appointment_at: iso,
      });
      setLead(data);
      setOpenAppt(false);
      load();
      toast.success(`Appointment set for ${new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deleteLead = async () => {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success("Lead deleted");
      navigate(-1);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      await api.post(`/leads/${id}/notes`, { note_text: newNote, is_pinned: false });
      setNewNote("");
      toast.success("Note added");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const logCall = async () => {
    if (!callForm.call_result) { toast.error("Please pick a call result"); return; }
    try {
      await api.post(`/leads/${id}/call-logs`, {
        call_result: callForm.call_result,
        notes: callForm.notes,
        follow_up_date: callForm.follow_up_date || null,
        duration: callForm.duration ? parseInt(callForm.duration, 10) : null,
      });
      toast.success("Call logged");
      setOpenCall(false);
      setCallForm({ call_result: "", notes: "", follow_up_date: "", duration: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const agentName = (aid) => {
    if (!aid) return "Unassigned";
    const a = agents.find((x) => x.id === aid);
    return a ? `${a.first_name} ${a.last_name}` : aid;
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4" data-testid="lead-back">
        <ArrowLeft size={14}/> Back
      </button>

      {/* Header */}
      <Card className="p-5 mb-5 border-slate-200 rounded-md shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                 style={{ background: "#026AA2" }}>
              {(lead.first_name?.[0] || "") + (lead.last_name?.[0] || "")}
            </div>
            <div>
              <h1 className="font-heading text-2xl font-semibold text-slate-900" data-testid="lead-name">
                {lead.full_name}
              </h1>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <StatusBadge status={lead.lead_status} />
                {lead.appointment_at && lead.lead_status === "Appointment Set" && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-medium" data-testid="appt-badge">
                    <Calendar size={11}/>
                    {new Date(lead.appointment_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {lead.is_duplicate && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Possible duplicate
                  </span>
                )}
                <span className="text-xs text-slate-500">Assigned to {agentName(lead.assigned_agent_id)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={lead.lead_type || "New to Medicare"} onValueChange={(v) => updateField("lead_type", v)}>
              <SelectTrigger className="h-9 w-40" data-testid="lead-type-select"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="New to Medicare">New to Medicare</SelectItem>
                <SelectItem value="Transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={lead.lead_status} onValueChange={(v) => updateField("lead_status", v)}>
              <SelectTrigger className="h-9 w-44" data-testid="lead-status-select"><SelectValue/></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {isOwner && (
              <Select value={lead.assigned_agent_id || "none"} onValueChange={(v) => updateField("assigned_agent_id", v === "none" ? null : v)}>
                <SelectTrigger className="h-9 w-44" data-testid="lead-agent-select"><SelectValue placeholder="Assign agent"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Dialog open={openCall} onOpenChange={setOpenCall}>
              <DialogTrigger asChild>
                <Button className="h-9 text-white" style={{ background: "#026AA2" }} data-testid="log-call-button">
                  <PhoneCall size={14} className="mr-1.5"/> Log Call
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log call attempt</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Call result</Label>
                    <Select value={callForm.call_result} onValueChange={(v) => setCallForm({ ...callForm, call_result: v })}>
                      <SelectTrigger className="mt-1.5" data-testid="call-result-select"><SelectValue placeholder="Choose..."/></SelectTrigger>
                      <SelectContent>
                        {callResults.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={callForm.notes} onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                              className="mt-1.5" rows={3} data-testid="call-notes"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Follow-up</Label>
                      <Input type="date" value={callForm.follow_up_date} onChange={(e) => setCallForm({ ...callForm, follow_up_date: e.target.value })} className="mt-1.5" data-testid="call-followup"/>
                    </div>
                    <div>
                      <Label className="text-xs">Duration (sec)</Label>
                      <Input type="number" value={callForm.duration} onChange={(e) => setCallForm({ ...callForm, duration: e.target.value })} className="mt-1.5" data-testid="call-duration"/>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setOpenCall(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
                  <Button onClick={logCall} className="text-white" style={{ background: "#026AA2" }} data-testid="call-save">Save call</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {isOwner && (
              <Button onClick={deleteLead} className="h-9 bg-white border border-red-200 text-red-600 hover:bg-red-50" data-testid="lead-delete">
                <Trash2 size={14}/>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Appointment date/time dialog */}
      <Dialog open={openAppt} onOpenChange={setOpenAppt}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule appointment</DialogTitle></DialogHeader>
          <p className="text-xs text-slate-500 -mt-2">You'll get a reminder 5 minutes before the appointment starts.</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} className="mt-1.5" data-testid="appt-date"/>
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} className="mt-1.5" data-testid="appt-time"/>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenAppt(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button onClick={saveAppointment} className="text-white" style={{ background: "#026AA2" }} data-testid="appt-save">
              <Calendar size={13} className="mr-1.5"/> Save appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Overview */}
        <Card className="p-5 lg:col-span-1 border-slate-200 rounded-md shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User size={15} className="text-[#026AA2]"/> Lead Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" value={lead.first_name}/>
            <Field label="Last Name" value={lead.last_name}/>
            <Field label="Birthdate" value={lead.birthdate}/>
            <Field label="Phone" value={lead.phone_number} copyable/>
            <Field label="Other Phone" value={lead.other_phone_number} copyable/>
            <Field label="Address" value={lead.address}/>
            <Field label="City / State" value={lead.city ? `${lead.city}, ${lead.state}` : ""}/>
            <Field label="Zip" value={lead.zip_code}/>
            <Field label="County" value={lead.county}/>
            <Field label="Medicare #" value={lead.medicare_number} copyable/>
            <Field label="Medicaid #" value={lead.medicaid_number} copyable/>
            <Field label="Lead Type" value={lead.lead_type || "New to Medicare"}/>
            <Field label="Medicaid Provider" value={lead.medicaid_provider}/>
            <Field label="Medicare Parts" value={lead.medicare_parts}/>
          </div>
          <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
            <Field label="Created" value={lead.created_at ? new Date(lead.created_at).toLocaleString() : ""}/>
            <Field label="Last Updated" value={lead.updated_at ? new Date(lead.updated_at).toLocaleString() : ""}/>
          </div>
        </Card>

        {/* Tabs */}
        <Card className="p-0 lg:col-span-2 border-slate-200 rounded-md shadow-sm">
          <Tabs defaultValue="activity">
            <TabsList className="w-full justify-start border-b border-slate-200 rounded-none bg-transparent h-auto p-0">
              <TabsTrigger value="activity" data-testid="tab-activity" className="data-[state=active]:border-b-2 data-[state=active]:border-[#026AA2] data-[state=active]:text-[#026AA2] rounded-none h-11 px-5">
                <History size={14} className="mr-1.5"/> Activity
              </TabsTrigger>
              <TabsTrigger value="notes" data-testid="tab-notes" className="data-[state=active]:border-b-2 data-[state=active]:border-[#026AA2] data-[state=active]:text-[#026AA2] rounded-none h-11 px-5">
                <FileText size={14} className="mr-1.5"/> Notes ({notes.length})
              </TabsTrigger>
              <TabsTrigger value="calls" data-testid="tab-calls" className="data-[state=active]:border-b-2 data-[state=active]:border-[#026AA2] data-[state=active]:text-[#026AA2] rounded-none h-11 px-5">
                <PhoneCall size={14} className="mr-1.5"/> Calls ({calls.length})
              </TabsTrigger>
              <TabsTrigger value="application" data-testid="tab-application" className="data-[state=active]:border-b-2 data-[state=active]:border-[#026AA2] data-[state=active]:text-[#026AA2] rounded-none h-11 px-5">
                <ClipboardEdit size={14} className="mr-1.5"/> Application Info
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="p-5 m-0">
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {activity.length === 0 && <div className="text-sm text-slate-400">No activity yet.</div>}
                {activity.map((a) => (
                  <div key={a.id} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 shrink-0">
                      {a.type === "note" && <FileText size={12}/>}
                      {a.type === "call" && <PhoneCall size={12}/>}
                      {a.type === "audit" && <ClipboardEdit size={12}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-800">{a.user_name || "System"}</span>
                        {" · "}
                        <span>{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      {a.type === "note" && <div className="text-sm text-slate-700 mt-0.5">{a.text}</div>}
                      {a.type === "call" && (
                        <div className="text-sm text-slate-700 mt-0.5">
                          <span className="font-medium">{a.call_result}</span>
                          {a.notes && <span className="text-slate-500"> — {a.notes}</span>}
                        </div>
                      )}
                      {a.type === "audit" && (
                        <div className="text-sm text-slate-700 mt-0.5">
                          {a.action === "status_changed" && <>Status changed {a.old ? `from "${a.old}" ` : ""}to <strong>{a.new}</strong></>}
                          {a.action === "lead_assigned" && <>Assigned to <strong>{agentName(a.new)}</strong></>}
                          {a.action === "lead_created" && <>Lead created</>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="p-5 m-0">
              <div className="flex gap-2 mb-4">
                <Textarea
                  placeholder="Add a note about this lead..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  data-testid="new-note-text"
                  rows={2}
                />
                <Button onClick={addNote} className="text-white shrink-0" style={{ background: "#026AA2" }} data-testid="add-note-button">
                  <Plus size={14} className="mr-1.5"/> Add note
                </Button>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {notes.length === 0 && <div className="text-sm text-slate-400">No notes yet.</div>}
                {notes.map((n) => (
                  <div key={n.id} className="p-3 rounded-md border border-slate-200 bg-slate-50/50" data-testid={`note-${n.id}`}>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                      <span><span className="font-medium text-slate-800">{n.user_name}</span> · {new Date(n.created_at).toLocaleString()}</span>
                      {n.is_pinned && <Pin size={11} className="text-amber-500"/>}
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.note_text}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="calls" className="p-5 m-0">
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {calls.length === 0 && <div className="text-sm text-slate-400">No call logs yet.</div>}
                {calls.map((c) => (
                  <div key={c.id} className="p-3 rounded-md border border-slate-200" data-testid={`call-${c.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium text-slate-900">{c.call_result}</div>
                      <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
                    </div>
                    {c.notes && <div className="text-sm text-slate-600 mt-1">{c.notes}</div>}
                    <div className="text-xs text-slate-500 mt-1">
                      by {c.user_name}
                      {c.follow_up_date && <> · follow-up <strong>{c.follow_up_date}</strong></>}
                      {c.duration && <> · {Math.floor(c.duration / 60)}m {c.duration % 60}s</>}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="application" className="p-5 m-0">
              <ApplicationInfo lead={lead} onSaved={load}/>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
