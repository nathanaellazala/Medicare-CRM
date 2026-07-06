import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Briefcase, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={user.role === "owner" ? "/dashboard" : "/my-leads"} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.first_name}!`);
      navigate(u.role === "owner" ? "/dashboard" : "/my-leads");
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden"
           style={{ background: "linear-gradient(135deg, #014266 0%, #026AA2 60%, #0284C7 100%)" }}>
        <div className="absolute inset-0 opacity-[0.08]"
             style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}/>
        <div className="relative max-w-md text-white">
          <div className="inline-flex items-center gap-3 mb-8 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/20">
            <Briefcase size={14} />
            <span className="text-xs font-medium uppercase tracking-wider">Enterprise Medicare CRM</span>
          </div>
          <h1 className="font-heading text-5xl font-semibold leading-tight mb-5">
            The command center for your Medicare sales team.
          </h1>
          <p className="text-sky-100/90 text-base leading-relaxed mb-10">
            Health Experts CRM helps agencies upload leads, assign to agents, log calls,
            and track performance — all in one professional workspace.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/15">
            {[
              { n: "Fast", l: "Import & assign" },
              { n: "Live", l: "Team leaderboard" },
              { n: "Secure", l: "Role-based access" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-heading text-2xl font-semibold">{s.n}</div>
                <div className="text-xs text-sky-200/80 uppercase tracking-wider mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-md flex items-center justify-center text-white"
                 style={{ background: "#026AA2" }}>
              <Briefcase size={18} />
            </div>
            <div>
              <div className="font-heading font-semibold text-slate-900">Health Experts</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">CRM</div>
            </div>
          </div>

          <h2 className="font-heading text-2xl font-semibold text-slate-900 mb-1.5">Sign in</h2>
          <p className="text-sm text-slate-500 mb-8">
            Use your work email to access the CRM.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
                className="mt-1.5"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700">Password</Label>
                <button type="button" className="text-xs text-[#026AA2] hover:underline" data-testid="login-forgot">
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password"
                className="mt-1.5"
                required
              />
            </div>
            {error && (
              <div data-testid="login-error" className="text-xs px-3 py-2 rounded bg-red-50 text-red-700 border border-red-100">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full h-10 text-white font-medium"
              style={{ background: "#026AA2" }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
