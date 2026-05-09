import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { session, isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) navigate({ to: "/login" });
    else if (adminOnly && !isAdmin) navigate({ to: "/dashboard" });
  }, [session, isAdmin, adminOnly, navigate]);
  if (!session) return null;
  if (adminOnly && !isAdmin) return null;
  return <>{children}</>;
}