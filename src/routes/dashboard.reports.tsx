import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/RequireAuth";
import { Users, Activity, CalendarCheck, Trophy, RefreshCcw } from "lucide-react";
import { DAY_NAMES, SHIFT_LABEL } from "@/lib/admin-api";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/reports")({
  component: () => <RequireAuth adminOnly><ReportsPage /></RequireAuth>,
});

interface Doctor { id: string; name: string; speciality: string; }
interface Booking { id: string; doctor_id: string; booking_date: string; day_of_week: number; shift: string|null; status: string; patient_phone: string|null; created_at: string; }

const ymd = (d: Date) => d.toISOString().slice(0,10);

function ReportsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [period, setPeriod] = useState<"week"|"month"|"year"|"custom">("week");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([
        supabase.from("doctors").select("id,name,speciality").order("name"),
        supabase.from("bookings").select("*").order("booking_date", { ascending: false }),
      ]);
      setDoctors((d.data ?? []) as Doctor[]);
      setBookings((b.data ?? []) as Booking[]);
    } catch (e: any) { toast.error(e.message || "تعذّر التحميل"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Compute date window based on selected period
  const range = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    if (period === "custom") {
      return { from: from || "0000-01-01", to: to || "9999-12-31" };
    }
    const start = new Date(today);
    if (period === "week") start.setDate(today.getDate() - 6);
    else if (period === "month") start.setDate(today.getDate() - 29);
    else if (period === "year") start.setDate(today.getDate() - 364);
    return { from: ymd(start), to: ymd(today) };
  }, [period, from, to]);

  const filtered = useMemo(() => bookings.filter(b => {
    if (b.booking_date < range.from || b.booking_date > range.to) return false;
    if (doctorFilter !== "all" && b.doctor_id !== doctorFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (shiftFilter !== "all" && b.shift !== shiftFilter) return false;
    return true;
  }), [bookings, range, doctorFilter, statusFilter, shiftFilter]);

  const totalBookings = filtered.length;
  const uniquePatients = new Set(filtered.map(b => b.patient_phone || b.id)).size;
  const confirmedCount = filtered.filter(b => b.status === "confirmed").length;
  const completedCount = filtered.filter(b => b.status === "completed").length;
  const cancelledCount = filtered.filter(b => b.status === "cancelled").length;

  // Per-doctor counts
  const perDoctor = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach(b => m.set(b.doctor_id, (m.get(b.doctor_id) ?? 0) + 1));
    return doctors.map(d => ({ doctor: d, count: m.get(d.id) ?? 0 })).sort((a,b) => b.count - a.count);
  }, [filtered, doctors]);

  const top5 = perDoctor.slice(0, 5);
  const maxCount = top5[0]?.count || 1;

  // Per-day breakdown
  const perDay = useMemo(() => {
    const arr = Array(6).fill(0);
    filtered.forEach(b => { if (b.day_of_week >= 0 && b.day_of_week < 6) arr[b.day_of_week]++; });
    return arr;
  }, [filtered]);
  const maxDay = Math.max(1, ...perDay);

  // Per-shift breakdown
  const perShift = useMemo(() => {
    const morning = filtered.filter(b => b.shift === "morning").length;
    const evening = filtered.filter(b => b.shift === "evening").length;
    return { morning, evening };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-primary">التقارير والإحصاءات</h2>
          <p className="text-sm text-muted-foreground">تحليل شامل للحجوزات وأداء الأطباء.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="h-4 w-4 ml-1" /> تحديث</Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1 sm:col-span-1"><Label>الفترة</Label>
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">آخر أسبوع</SelectItem>
                <SelectItem value="month">آخر شهر</SelectItem>
                <SelectItem value="year">آخر سنة</SelectItem>
                <SelectItem value="custom">مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>من</Label><Input type="date" value={from} onChange={e=>{setFrom(e.target.value); setPeriod("custom");}} /></div>
          <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} onChange={e=>{setTo(e.target.value); setPeriod("custom");}} /></div>
          <div className="space-y-1"><Label>الطبيب</Label>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {doctors.map(d => <SelectItem key={d.id} value={d.id}>د. {d.name}</SelectItem>)}
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
          <div className="space-y-1"><Label>الفترة اليومية</Label>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="morning">صباحي</SelectItem>
                <SelectItem value="evening">مسائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">عدد الأطباء</div><div className="text-2xl font-bold">{doctors.length}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><CalendarCheck className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">إجمالي الحجوزات</div><div className="text-2xl font-bold">{totalBookings}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><Activity className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">عدد المرضى</div><div className="text-2xl font-bold">{uniquePatients}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><Trophy className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">مكتمل / ملغي</div><div className="text-2xl font-bold">{completedCount} / <span className="text-destructive">{cancelledCount}</span></div></div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> أفضل ٥ أطباء (الأكثر استقبالاً للحالات)</h3>
          {top5.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>}
          <div className="space-y-3">
            {top5.map((row, i) => (
              <div key={row.doctor.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">#{i+1} د. {row.doctor.name}</span>
                  <span className="font-bold text-primary">{row.count}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(row.count/maxCount)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold mb-3">توزيع الحجوزات حسب اليوم</h3>
          <div className="space-y-2">
            {perDay.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs w-16 text-muted-foreground">{DAY_NAMES[i]}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(c/maxDay)*100}%` }} />
                </div>
                <span className="text-xs font-bold w-10 text-end">{c}</span>
              </div>
            ))}
          </div>

          <h3 className="font-bold mb-3 mt-6">حسب الفترة</h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{SHIFT_LABEL.morning}</div><div className="text-xl font-bold">{perShift.morning}</div></div>
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{SHIFT_LABEL.evening}</div><div className="text-xl font-bold">{perShift.evening}</div></div>
          </div>

          <h3 className="font-bold mb-3 mt-6">حسب الحالة</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">مؤكد</div><div className="text-xl font-bold">{confirmedCount}</div></div>
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">مكتمل</div><div className="text-xl font-bold">{completedCount}</div></div>
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">ملغي</div><div className="text-xl font-bold text-destructive">{cancelledCount}</div></div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-bold mb-3">عدد الحجوزات لكل طبيب</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3 font-semibold">الطبيب</th>
                <th className="p-3 font-semibold">التخصص</th>
                <th className="p-3 font-semibold">عدد الحجوزات</th>
              </tr>
            </thead>
            <tbody>
              {perDoctor.map(r => (
                <tr key={r.doctor.id} className="border-t">
                  <td className="p-3 font-medium">د. {r.doctor.name}</td>
                  <td className="p-3 text-muted-foreground">{r.doctor.speciality}</td>
                  <td className="p-3 font-bold text-primary">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
