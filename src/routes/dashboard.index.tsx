import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAY_NAMES, SHIFT_LABEL, adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { Trash2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({ component: BookingsPage });

interface Doctor { id: string; name: string; speciality: string; }
interface Schedule { id: string; doctor_id: string; day_of_week: number; shift: string; max_capacity: number; }
interface Booking { id: string; doctor_id: string; patient_name: string; patient_phone: string|null; booking_date: string; day_of_week: number; shift: string|null; created_at: string; }

function BookingsPage() {
  const { isAdmin, session } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [date, setDate] = useState<string>("");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        supabase.from("doctors").select("*").order("name"),
        supabase.from("schedules").select("*"),
      ]);
      setDoctors(d.data ?? []);
      setSchedules(s.data ?? []);
      if (session?.password) {
        const res: any = await adminAction(session.password, "bookings.list", {});
        setBookings((res?.data ?? []) as Booking[]);
      } else {
        setBookings([]);
      }
    } catch (e: any) {
      toast.error(e.message || "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("bookings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => bookings.filter(b => {
    if (date && b.booking_date !== date) return false;
    if (doctorFilter !== "all" && b.doctor_id !== doctorFilter) return false;
    return true;
  }), [bookings, date, doctorFilter]);

  const docName = (id: string) => doctors.find(d => d.id === id)?.name ?? "—";

  const capacityFor = (doctorId: string, dow: number) =>
    schedules.filter(s => s.doctor_id === doctorId && s.day_of_week === dow).reduce((a,s)=>a+s.max_capacity,0);

  const usedFor = (doctorId: string, dt: string) =>
    bookings.filter(b => b.doctor_id === doctorId && b.booking_date === dt).length;

  // Capacity summary: remaining today per doctor
  const today = new Date();
  const todayDow = [6,0,1,2,3,4,5][today.getDay()]; // Sun=6→will exclude (Friday)
  // Actually JS: Sat=6→our 0, Sun=0→1, Mon=1→2 etc.
  const mapped = ((): number => {
    const m = [1,2,3,4,5,-1,0]; // Sun..Sat
    return m[today.getDay()];
  })();
  const todayStr = today.toISOString().slice(0,10);

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا الحجز؟")) return;
    try {
      await adminAction(session!.password!, "booking.delete", { id });
      toast.success("تم الحذف");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">الحجوزات</h2>
          <p className="text-sm text-muted-foreground">عرض الحجوزات والسعة المتبقية لكل طبيب.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>

      {/* Capacity summary cards */}
      {mapped >= 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">السعة المتبقية اليوم ({DAY_NAMES[mapped]} - {todayStr})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {doctors.map(d => {
              const cap = capacityFor(d.id, mapped);
              const used = usedFor(d.id, todayStr);
              const remaining = Math.max(0, cap - used);
              if (cap === 0) return null;
              return (
                <Card key={d.id} className="p-4">
                  <div className="font-semibold">د. {d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.speciality}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">{remaining}</span>
                    <span className="text-xs text-muted-foreground">متبقي من {cap}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>الطبيب</Label>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأطباء</SelectItem>
                {doctors.map(d => <SelectItem key={d.id} value={d.id}>د. {d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex flex-col">
            <Label>&nbsp;</Label>
            <Button variant="ghost" onClick={() => { setDate(""); setDoctorFilter("all"); }}>مسح الفلاتر</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3 font-semibold">المريض</th>
                <th className="p-3 font-semibold">الطبيب</th>
                <th className="p-3 font-semibold">اليوم</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الفترة</th>
                <th className="p-3 font-semibold">الجوال</th>
                {isAdmin && <th className="p-3 font-semibold">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="p-6 text-center text-muted-foreground">لا توجد حجوزات</td></tr>
              )}
              {filtered.map(b => (
                <tr key={b.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{b.patient_name}</td>
                  <td className="p-3">د. {docName(b.doctor_id)}</td>
                  <td className="p-3">{DAY_NAMES[b.day_of_week]}</td>
                  <td className="p-3 font-mono">{b.booking_date}</td>
                  <td className="p-3">{b.shift ? SHIFT_LABEL[b.shift] : "—"}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{b.patient_phone || "—"}</td>
                  {isAdmin && (
                    <td className="p-3">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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