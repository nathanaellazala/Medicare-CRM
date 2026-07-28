import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import OwnerDashboard from "@/pages/OwnerDashboard";
import AgentDashboard from "@/pages/AgentDashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import ImportLeads from "@/pages/ImportLeads";
import Agents from "@/pages/Agents";
import AssignLeads from "@/pages/AssignLeads";
import Duplicates from "@/pages/Duplicates";
import Leaderboard from "@/pages/Leaderboard";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import Resources from "@/pages/Resources";
import BookOfBusiness from "@/pages/BookOfBusiness";
import Appointments from "@/pages/Appointments";
import SharedLeads from "@/pages/SharedLeads";
import SharedLeadDetail from "@/pages/SharedLeadDetail";
import { Toaster } from "sonner";

function DashboardSwitch() {
  const { user } = useAuth();
  return user?.role === "owner" ? <OwnerDashboard /> : <AgentDashboard />;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "owner" ? "/dashboard" : "/my-leads"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardSwitch />} />
            <Route path="/leads" element={<ProtectedRoute ownerOnly><Leads /></ProtectedRoute>} />
            <Route path="/my-leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/import" element={<ProtectedRoute ownerOnly><ImportLeads /></ProtectedRoute>} />
            <Route path="/agents" element={<ProtectedRoute ownerOnly><Agents /></ProtectedRoute>} />
            <Route path="/assign" element={<ProtectedRoute ownerOnly><AssignLeads /></ProtectedRoute>} />
            <Route path="/duplicates" element={<ProtectedRoute ownerOnly><Duplicates /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/book-of-business" element={<BookOfBusiness />} />
            <Route path="/shared-leads" element={<SharedLeads />} />
            <Route path="/shared-leads/:id" element={<SharedLeadDetail />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/reports" element={<ProtectedRoute ownerOnly><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
