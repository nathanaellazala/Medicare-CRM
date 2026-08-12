import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, Upload, UserCog, Shuffle, Copy,
  Trophy, BarChart3, Settings, LogOut, Search, Bell, Briefcase,
  ChevronDown, BookOpen, Sparkles, Clock, Calendar as CalendarIcon,
  Radio
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const ownerNav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/import", icon: Upload, label: "Import Leads" },
  { to: "/agents", icon: UserCog, label: "Agents" },
  { to: "/assign", icon: Shuffle, label: "Assign Leads" },
  { to: "/shared-leads", icon: Radio, label: "Shared Leads" },
  { to: "/appointments", icon: CalendarIcon, label: "Appointments" },
  { to: "/plan-brochures", icon: BookOpen, label: "Plan Brochures" },
  { to: "/duplicates", icon: Copy, label: "Duplicates" },
  { to: "/book-of-business", icon: BookOpen, label: "Book of Business" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const agentNav = [
  { to: "/my-leads", icon: Users, label: "My Leads" },
  { to: "/dashboard", icon: LayoutDashboard, label: "My Dashboard" },
  { to: "/shared-leads", icon: Radio, label: "Shared Leads" },
  { to: "/appointments", icon: CalendarIcon, label: "Appointments" },
  { to: "/plan-brochures", icon: BookOpen, label: "Plan Brochures" },
  { to: "/book-of-business", icon: BookOpen, label: "Book of Business" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/resources", icon: Sparkles, label: "Resources" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [upcoming, setUpcoming] = useState([]);
  const alertedRef = useRef(new Set());
  const lastActivityRef = useRef(Date.now());
  const nav = user?.role === "owner" ? ownerNav : agentNav;
  const leadsPath = user?.role === "owner" ? "/leads" : "/my-leads";

  // Poll upcoming appointments every 30s; alert 5 minutes before start
  useEffect(() => {
    if (!user) return;
    // Ask the browser for notification permission once — enables true pop-ups
    // that fire even when the CRM tab is not focused.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get("/appointments/upcoming");
        if (cancelled) return;
        setUpcoming(data);
        const now = Date.now();
        for (const lead of data) {
          if (!lead.appointment_at) continue;
          const t = new Date(lead.appointment_at).getTime();
          const minutesUntil = (t - now) / 60000;
          if (minutesUntil > 4 && minutesUntil <= 5 && !alertedRef.current.has(lead.id)) {
            alertedRef.current.add(lead.id);
            const timeLabel = new Date(lead.appointment_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            // In-app toast
            toast.warning(`Appointment in 5 minutes: ${lead.full_name}`, {
              description: timeLabel,
              action: { label: "Open lead", onClick: () => navigate(`/leads/${lead.id}`) },
              duration: 12000,
            });
            // Desktop pop-up (works even when tab is not focused)
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                const n = new Notification(`Appointment in 5 minutes: ${lead.full_name}`, {
                  body: `${timeLabel}${lead.phone_number ? " · " + lead.phone_number : ""}`,
                  tag: `appt-${lead.id}`,
                  requireInteraction: true,
                });
                n.onclick = () => { window.focus(); navigate(`/leads/${lead.id}`); };
              } catch {}
            }
          }
        }
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line
  }, [user?.id]);

  // Activity tracking: send heartbeat on user activity; auto sign out after 30 min idle
  useEffect(() => {
    if (!user) return;
    const bump = () => { lastActivityRef.current = Date.now(); };
    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, bump, { passive: true })
    );

    // Heartbeat every 60s (only if there was recent activity)
    const heartbeat = setInterval(() => {
      const secondsSince = (Date.now() - lastActivityRef.current) / 1000;
      if (secondsSince < 90) {
        api.post("/users/me/heartbeat").catch(() => {});
      }
    }, 60000);

    // Idle check every 30s — auto-logout after 30 min
    const idleCheck = setInterval(async () => {
      const minutes = (Date.now() - lastActivityRef.current) / 60000;
      if (minutes >= 30) {
        clearInterval(heartbeat); clearInterval(idleCheck);
        await logout();
        navigate("/login");
      }
    }, 30000);

    // Send one immediately on mount
    api.post("/users/me/heartbeat").catch(() => {});

    return () => {
      ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((ev) =>
        window.removeEventListener(ev, bump)
      );
      clearInterval(heartbeat);
      clearInterval(idleCheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const initials = `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`;

  const onSearch = (e) => {
    if (e.key === "Enter" && search.trim()) {
      navigate(`${leadsPath}?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className="w-60 bg-white border-r border-slate-200 flex flex-col h-full shrink-0"
      >
        <div className="h-16 flex items-center px-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-white"
              style={{ background: "#026AA2" }}
            >
              <Briefcase size={16} />
            </div>
            <div>
              <div className="font-heading font-semibold text-sm text-slate-900 leading-tight">
                HN
              </div>
              <div className="text-[10px] text-slate-500 tracking-wider uppercase">CRM</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 mx-2 my-0.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sky-50 text-[#026AA2]"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <item.icon size={16} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 px-1 mb-1">
            Signed in as
          </div>
          <div className="text-xs text-slate-600 px-1 truncate">{user?.email}</div>
          <div className="text-[11px] text-slate-400 px-1 capitalize">{user?.role}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top nav */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96 max-w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="global-search"
              placeholder="Search leads by name, phone, county..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearch}
              className="pl-9 h-9 bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="appointment-bell"
                  className="relative w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
                >
                  <Bell size={16} />
                  {upcoming.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {upcoming.length}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs flex items-center gap-2">
                  <Clock size={13}/> Upcoming appointments (30 min)
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {upcoming.length === 0 && (
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">No upcoming appointments</div>
                )}
                {upcoming.map((l) => (
                  <DropdownMenuItem key={l.id} onClick={() => navigate(`/leads/${l.id}`)} className="flex-col items-start">
                    <div className="text-sm font-medium text-slate-900">{l.full_name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(l.appointment_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="user-menu-trigger"
                  className="flex items-center gap-2 pl-2 pr-3 h-9 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ background: "#026AA2" }}
                  >
                    {initials.toUpperCase()}
                  </div>
                  <div className="text-left leading-tight">
                    <div className="text-xs font-medium text-slate-900">
                      {user?.first_name} {user?.last_name}
                    </div>
                    <div className="text-[10px] text-slate-500 capitalize">{user?.role}</div>
                  </div>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
                  <Settings size={14} className="mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => { await logout(); navigate("/login"); }} data-testid="menu-logout">
                  <LogOut size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
