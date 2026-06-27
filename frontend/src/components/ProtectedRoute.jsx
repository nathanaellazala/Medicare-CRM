import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, ownerOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (ownerOnly && user.role !== "owner") return <Navigate to="/my-leads" replace />;
  return children;
}
