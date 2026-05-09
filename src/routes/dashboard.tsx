import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AppNav } from "@/components/AppNav";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/dashboard")({ component: DashboardLayout });

function DashboardLayout() {
  return (
    <RequireAuth>
      <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-soft)" }}>
        <AppHeader />
        <AppNav />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </RequireAuth>
  );
}