import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar, Clock, User, Phone, ExternalLink, X, Trash2, Save,
} from "lucide-react";
import { toast } from "sonner";

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pad(n) { return String(n).padStart(2, "0"); }

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === "owner";
  const [appts, setAppts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: "", time: "" });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/appointments");
      setAppts(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Which dates have appointments — for calendar highlight
  const apptDays = useMemo(() => {
    return appts.map((a) => new Date(a.appointment_at));
  }, [appts]);

  const dayHasAppt = (day) => apptDays.some((d) => sameDay(d, day));

  const forSelected = useMemo(() => {
    return appts
      .filter((a) => sameDay(new Date(a.appointment_at), selectedDate))
      .sort((a, b) => new Date(a.appointment_at) - new Date(b.appointment_at));
  }, [appts, selectedDate]);

  const openEdit = (a) => {
    const dt = new Date(a.appointment_at);
    setEditing(a);
    setForm({
      date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
      time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
    });
  };

  const saveEdit = async () => {
    if (!form.date || !form.time) { toast.error("Pick date and time"); return; }
    const iso = new Date(`${form.date}T${form.time}`).toISOString();
    try {
      await api.patch(`/leads/${editing.id}`, { appointment_at: iso });
      toast.success("Appointment updated");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const cancelAppt = async (a) => {
    if (!window.confirm(`Cancel appointment with ${a.full_name}?`)) return;
    try {
      await api.post(`/appointments/${a.id}/cancel`);
      toast.success("Appointment cancelled");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deleteLead = async (a) => {
    if (!window.confirm(`Delete the lead ${a.full_name}? This removes the lead entirely.`)) return;
    try {
      await api.delete(`/leads/${a.id}`);
      toast.success("Lead deleted");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const now = new Date();
  const upcomingCount = appts.filter((a) => new Date(a.appointment_at) >= now).length;
  const todayCount = appts.filter((a) => sameDay(new Date(a.appointment_at), now)).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Calendar size={13}/> Schedule
          </div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Appointments</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isOwner ? "All team appointments." : "Your scheduled appointments."}
            {" "}A reminder pops up 5 minutes before each one starts.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Today</div>
            <div className="font-heading text-xl font-semibold text-purple-700" data-testid="appt-today-count">{todayCount}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Upcoming</div>
            <div className="font-heading text-xl font-semibold text-[#026AA2]">{upcomingCount}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Calendar */}
        <Card className="p-4 lg:col-span-2 border-slate-200 rounded-md shadow-sm">
          <div className="flex justify-center">
            <CalendarComp
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              modifiers={{ hasAppt: (day) => dayHasAppt(day) }}
              modifiersClassNames={{
                hasAppt: "!bg-sky-100 !text-[#026AA2] !font-bold ring-2 ring-[#026AA2]/30",
              }}
              className="rounded-md"
              data-testid="appt-calendar"
            />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <span className="w-3 h-3 rounded ring-2 ring-[#026AA2]/40 bg-sky-100 inline-block"/>
            Days with appointments
          </div>
        </Card>

        {/* Selected date's appointments */}
        <Card className="p-5 lg:col-span-3 border-slate-200 rounded-md shadow-sm">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-heading text-base font-semibold text-slate-900" data-testid="selected-date-header">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h2>
            <span className="text-xs text-slate-500">
              {forSelected.length} appointment{forSelected.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading && <div className="text-sm text-slate-400 py-6 text-center">Loading...</div>}
          {!loading && forSelected.length === 0 && (
            <div className="py-14 text-center">
              <Calendar size={30} className="mx-auto text-slate-300 mb-2"/>
              <div className="text-sm font-medium text-slate-600">No appointments this day.</div>
              <div className="text-xs text-slate-400">Pick another date on the calendar.</div>
            </div>
          )}

          <div className="space-y-2">
            {forSelected.map((a) => {
              const t = new Date(a.appointment_at);
              const isPast = t < now;
              return (
                <div
                  key={a.id}
                  data-testid={`appt-row-${a.id}`}
                  className={`p-3 rounded-md border transition-colors hover:border-[#026AA2] ${
                    isPast ? "border-slate-200 bg-slate-50/50 opacity-70" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 text-center shrink-0">
                      <div className="font-heading text-lg font-bold text-purple-700 leading-tight">
                        {t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                      {isPast && <div className="text-[9px] text-slate-400 uppercase tracking-wider">Past</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                        <User size={12} className="text-slate-400"/> {a.full_name}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                        {a.phone_number && <span className="inline-flex items-center gap-1"><Phone size={10}/> {a.phone_number}</span>}
                        {isOwner && <span>· Agent: {a.agent_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => navigate(`/leads/${a.id}`)}
                        className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                        title="Open lead"
                        data-testid={`appt-open-${a.id}`}
                      >
                        <ExternalLink size={12}/>
                      </Button>
                      <Button
                        onClick={() => openEdit(a)}
                        className="h-8 px-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                        title="Reschedule"
                        data-testid={`appt-edit-${a.id}`}
                      >
                        <Clock size={12}/>
                      </Button>
                      <Button
                        onClick={() => cancelAppt(a)}
                        className="h-8 px-2 bg-white border border-slate-300 text-red-600 hover:bg-red-50 hover:border-red-200"
                        title="Cancel appointment"
                        data-testid={`appt-cancel-${a.id}`}
                      >
                        <X size={12}/>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Edit appointment dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule with {editing?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1.5" data-testid="edit-appt-date"/>
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1.5" data-testid="edit-appt-time"/>
            </div>
          </div>
          <DialogFooter className="mt-3 flex-wrap gap-2">
            {isOwner && editing && (
              <Button onClick={() => deleteLead(editing)} className="mr-auto bg-white border border-red-200 text-red-600 hover:bg-red-50" data-testid="edit-appt-delete">
                <Trash2 size={13} className="mr-1.5"/> Delete lead
              </Button>
            )}
            {editing && (
              <Button onClick={() => cancelAppt(editing)} className="bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-600" data-testid="edit-appt-cancel-appt">
                <X size={13} className="mr-1.5"/> Cancel appointment
              </Button>
            )}
            <Button onClick={() => setEditing(null)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Close</Button>
            <Button onClick={saveEdit} className="text-white" style={{ background: "#026AA2" }} data-testid="edit-appt-save">
              <Save size={13} className="mr-1.5"/> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
