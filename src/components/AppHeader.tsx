import { useNavigate } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Logo size={48} />
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-primary leading-tight truncate">
            نظام إدارة التسجيل
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            مستشفى برج الأطباء
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-left">
              <div className="text-xs text-muted-foreground">
                {role === "admin" ? "مدير النظام" : role === "receptionist" ? "موظف استقبال" : "—"}
              </div>
              <div className="text-sm font-semibold truncate max-w-[200px]" dir="ltr">{(user.email ?? "").replace(/@borg\.local$/, "")}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            >
              <LogOut className="h-4 w-4 ml-1" />
              خروج
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
