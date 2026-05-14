import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAY_NAMES, SHIFT_LABEL, adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/doctor/$doctorId")({ component: DoctorBookingsPage });

interface Doctor { id: string; name: string; speciality: string; }
interface Booking {
  id: string; doctor_id: string; patient_name: string; patient_phone: string|null;
  booking_date: string; day_of_week: number; shift: string|null; status: string; created_at: string;
}

function DoctorBookingsPage() {
  const { doctorId } = Route.useParams();
  const { isAdmin } = useAuth();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [date, setDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const load = async () => {
    const [d, b] = await Promise.all([
      supabase.from("doctors").select("id,name,speciality").eq("id", doctorId).maybeSingle(),
      supabase.from("bookings").select("*").eq("doctor_id", doctorId)
        .order("booking_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setDoctor(d.data as Doctor | null);
    setBookings((b.data ?? []) as Booking[]);
  };
  useEffect(() => { load(); }, [doctorId]);
  useEffect(() => {
    const ch = supabase.channel("doctor-bookings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `doctor_id=eq.${doctorId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctorId]);

  const filtered = useMemo(() => bookings.filter(b => {
    if (date && b.booking_date !== date) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (shiftFilter !== "all" && b.shift !== shiftFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const phone = (b.patient_phone || "").toLowerCase();
      const name = (b.patient_name || "").toLowerCase();
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  }), [bookings, date, statusFilter, shiftFilter, search]);

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا الحجز؟")) return;
    try { await adminAction("booking.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const handleStatus = async (id: string, status: string) => {
    try { await adminAction("booking.updateStatus", { id, status }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowRight className="h-4 w-4" /> العودة للحجوزات
          </Link>
          <h2 className="text-2xl font-bold text-primary">د. {doctor?.name ?? "..."}</h2>
          <p className="text-sm text-muted-foreground">{doctor?.speciality}</p>
        </div>
        <div className="text-end">
          <div className="text-xs text-muted-foreground">إجمالي الحجوزات</div>
          <div className="text-2xl font-bold">{bookings.length}</div>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1 lg:col-span-2"><Label>بحث (اسم المريض أو رقم الجوال)</Label>
            <Input placeholder="اكتب للبحث..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="space-y-1"><Label>الفترة</Label>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="morning">صباحي</SelectItem>
                <SelectItem value="evening">مسائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="confirmed">مؤكد</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex flex-col lg:col-span-5 sm:flex-row sm:justify-end"><Label className="sm:hidden">&nbsp;</Label>
            <Button variant="ghost" onClick={() => { setDate(""); setStatusFilter("all"); setShiftFilter("all"); setSearch(""); }}>مسح الفلاتر</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3 font-semibold">المريض</th>
                <th className="p-3 font-semibold">اليوم</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الفترة</th>
                <th className="p-3 font-semibold">الجوال</th>
                <th className="p-3 font-semibold">الحالة</th>
                {isAdmin && <th className="p-3 font-semibold">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={isAdmin?7:6} className="p-6 text-center text-muted-foreground">لا توجد حجوزات</td></tr>}
              {filtered.map(b => (
                <tr key={b.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{b.patient_name}</td>
                  <td className="p-3">{DAY_NAMES[b.day_of_week]}</td>
                  <td className="p-3 font-mono">{b.booking_date}</td>
                  <td className="p-3">{b.shift ? SHIFT_LABEL[b.shift] : "—"}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{b.patient_phone || "—"}</td>
                  <td className="p-3">
                    {isAdmin ? (
                      <Select value={b.status} onValueChange={(v) => handleStatus(b.id, v)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">مؤكد</SelectItem>
                          <SelectItem value="completed">مكتمل</SelectItem>
                          <SelectItem value="cancelled">ملغي</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs">{b.status === "confirmed" ? "مؤكد" : b.status === "completed" ? "مكتمل" : b.status === "cancelled" ? "ملغي" : b.status}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="p-3">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
