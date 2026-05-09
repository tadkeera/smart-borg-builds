import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export function RequireAuth({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, role, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (adminOnly && !isAdmin) navigate({ to: "/dashboard" });
  }, [user, role, loading, isAdmin, adminOnly, navigate]);

  if (loading || !user || (adminOnly && !isAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
