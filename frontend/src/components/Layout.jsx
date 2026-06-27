import React, { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, Upload, UserCog, Shuffle, Copy,
  Trophy, BarChart3, Settings, LogOut, Search, Bell, Briefcase,
  ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";

const ownerNav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/import", icon: Upload, label: "Import Leads" },
  { to: "/agents", icon: UserCog, label: "Agents" },
  { to: "/assign", icon: Shuffle, label: "Assign Leads" },
  { to: "/duplicates", icon: Copy, label: "Duplicates" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const agentNav = [
  { to: "/my-leads", icon: Users, label: "My Leads" },
  { to: "/dashboard", icon: LayoutDashboard, label: "My Dashboard" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const nav = user?.role === "owner" ? ownerNav : agentNav;
  const leadsPath = user?.role === "owner" ? "/leads" : "/my-leads";

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
                Health Experts
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
              placeholder="Search leads by name, phone, Medicare, county..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearch}
              className="pl-9 h-9 bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600">
              <Bell size={16} />
            </button>
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
