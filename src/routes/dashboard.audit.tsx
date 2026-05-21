import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequireAuth } from "@/components/RequireAuth";
import { RefreshCcw, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/audit")({
  component: () => <RequireAuth permission="audit"><AuditPage /></RequireAuth>,
});

interface LogRow {
  id: string; created_at: string; user_id: string|null; user_email: string|null;
  user_display_name: string|null; action: string; entity: string; entity_id: string|null; details: any;
}

const ACTION_LABEL: Record<string,string> = {
  "doctor.create": "إنشاء طبيب", "doctor.update": "تعديل طبيب", "doctor.delete": "حذف طبيب",
  "schedule.upsert": "إنشاء/تحديث جدول", "schedule.update": "تعديل جدول", "schedule.delete": "حذف جدول",
  "booking.delete": "حذف حجز", "booking.updateStatus": "تغيير حالة حجز",
  "user.create": "إنشاء مستخدم", "user.delete": "حذف مستخدم",
};
const ENTITY_LABEL: Record<string,string> = { doctor:"طبيب", schedule:"جدول", booking:"حجز", user:"مستخدم" };

function AuditPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      setRows((data ?? []) as LogRow[]);
    } catch (e: any) { toast.error(e.message || "تعذّر التحميل"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const users = useMemo(() => {
    const m = new Map<string,string>();
    rows.forEach(r => { if (r.user_id) m.set(r.user_id, r.user_display_name || r.user_email || r.user_id); });
    return Array.from(m.entries());
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const d = r.created_at.slice(0,10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (userFilter !== "all" && r.user_id !== userFilter) return false;
    if (entityFilter !== "all" && r.entity !== entityFilter) return false;
    return true;
  }), [rows, from, to, userFilter, entityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-primary flex items-center gap-2"><ScrollText className="h-7 w-7" /> سجل التدقيق</h2>
          <p className="text-sm text-muted-foreground">جميع التغييرات الإدارية على النظام.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="h-4 w-4 ml-1" /> تحديث</Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1"><Label>من</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></div>
          <div className="space-y-1"><Label>المستخدم</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {users.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>النوع</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="doctor">طبيب</SelectItem>
                <SelectItem value="schedule">جدول</SelectItem>
                <SelectItem value="booking">حجز</SelectItem>
                <SelectItem value="user">مستخدم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex flex-col"><Label>&nbsp;</Label>
            <Button variant="ghost" onClick={()=>{setFrom("");setTo("");setUserFilter("all");setEntityFilter("all");}}>مسح</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3 font-semibold">الوقت</th>
                <th className="p-3 font-semibold">المستخدم</th>
                <th className="p-3 font-semibold">الإجراء</th>
                <th className="p-3 font-semibold">النوع</th>
                <th className="p-3 font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد سجلات</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/40 align-top">
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar-SA")}</td>
                  <td className="p-3">{r.user_display_name || r.user_email || "—"}</td>
                  <td className="p-3"><Badge variant="outline">{ACTION_LABEL[r.action] || r.action}</Badge></td>
                  <td className="p-3">{ENTITY_LABEL[r.entity] || r.entity}</td>
                  <td className="p-3"><pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground max-w-md overflow-x-auto" dir="ltr">{JSON.stringify(r.details, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t">إجمالي: {filtered.length}</div>
      </Card>
    </div>
  );
}
