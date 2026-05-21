import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, Permissions } from "@/lib/auth";
import { Loader2 } from "lucide-react";

interface RequireAuthProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  permission?: keyof Permissions;
}

export function RequireAuth({ children, adminOnly = false, permission }: RequireAuthProps) {
  const { user, role, loading, isAdmin, permissions } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (adminOnly && !isAdmin) { navigate({ to: "/dashboard" }); return; }
    if (permission && !isAdmin && permissions && !permissions[permission]) {
      navigate({ to: "/dashboard" });
    }
  }, [user, role, loading, isAdmin, permissions, adminOnly, permission, navigate]);

  const hasPermission = !permission || isAdmin || (permissions && permissions[permission]);
  const isAuthorized = (!adminOnly || isAdmin) && hasPermission;

  if (loading || !user || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
