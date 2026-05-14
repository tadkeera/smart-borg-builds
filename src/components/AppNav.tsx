import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { CalendarDays, Users, ClipboardList, MessageCircle, Settings, BarChart3, ScrollText } from "lucide-react";

const items = [
  { to: "/dashboard", label: "الحجوزات", icon: ClipboardList, adminOnly: false },
  { to: "/dashboard/reports", label: "التقارير", icon: BarChart3, adminOnly: true },
  { to: "/dashboard/doctors", label: "الأطباء", icon: Users, adminOnly: true },
  { to: "/dashboard/schedules", label: "الجداول", icon: CalendarDays, adminOnly: true },
  { to: "/dashboard/whatsapp", label: "الواتساب", icon: MessageCircle, adminOnly: true },
  { to: "/dashboard/audit", label: "سجل التدقيق", icon: ScrollText, adminOnly: true },
  { to: "/dashboard/account", label: "الحساب", icon: Settings, adminOnly: true },
];

export function AppNav() {
  const { isAdmin } = useAuth();
  const visible = items.filter(i => !i.adminOnly || isAdmin);
  return (
    <nav className="border-b bg-card">
      <div className="mx-auto max-w-7xl overflow-x-auto px-2">
        <ul className="flex gap-1 py-2 min-w-max">
          {visible.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: to === "/dashboard" }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                activeProps={{
                  className: "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold bg-primary text-primary-foreground shadow-sm"
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}