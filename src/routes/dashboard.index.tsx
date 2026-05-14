import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw, ChevronLeft, Users, CalendarDays, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({ component: BookingsOverview });

interface Doctor { id: string; name: string; speciality: string; is_paused: boolean; }
interface Schedule { id: string; doctor_id: string; day_of_week: number; shift: string; max_capacity: number; is_paused: boolean; }
interface Booking { id: string; doctor_id: string; booking_date: string; status: string; }

// Active week start (Sat) — rolls forward Thu 22:00
function activeWeekStart(now = new Date()): Date {
  const base = new Date(now); base.setHours(0,0,0,0);
  const back = (base.getDay() + 1) % 7;
  base.setDate(base.getDate() - back);
  const cutoff = new Date(base); cutoff.setDate(base.getDate()+5); cutoff.setHours(22,0,0,0);
  if (now >= cutoff) base.setDate(base.getDate() + 7);
  return base;
}
const ymd = (d: Date) => d.toISOString().slice(0,10);

function BookingsOverview() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [date, setDate] = useState<string>(ymd(new Date()));
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const start = activeWeekStart();
      const end = new Date(start); end.setDate(start.getDate()+13); // up to 2 weeks ahead
      const [d, s, b] = await Promise.all([
        supabase.from("doctors").select("*").order("name"),
        supabase.from("schedules").select("*"),
        supabase.from("bookings").select("id,doctor_id,booking_date,status")
          .gte("booking_date", ymd(start)).lte("booking_date", ymd(end)),
      ]);
      setDoctors((d.data ?? []) as Doctor[]);
      setSchedules((s.data ?? []) as Schedule[]);
      setBookings((b.data ?? []) as Booking[]);
    } catch (e: any) { toast.error(e.message || "تعذّر التحميل"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);
  useEffect(() => {
    const ch = supabase.channel("bookings-rt-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Map JS day → our dow (Sat=0..Thu=5, Fri=-1)
  const dow = useMemo(() => {
    const dt = new Date(date + "T00:00:00");
    return ([1,2,3,4,5,-1,0])[dt.getDay()];
  }, [date]);

  const doctorStats = useMemo(() => doctors.map(d => {
    const matching = schedules.filter(s => s.doctor_id === d.id && s.day_of_week === dow && !s.is_paused
      && (shiftFilter === "all" || s.shift === shiftFilter));
    const capacity = matching.reduce((a,s) => a + s.max_capacity, 0);
    const used = bookings.filter(b => b.doctor_id === d.id && b.booking_date === date && b.status !== "cancelled").length;
    return { doctor: d, capacity, used, remaining: Math.max(0, capacity - used) };
  }), [doctors, schedules, bookings, dow, date, shiftFilter]);

  const totalCapacity = doctorStats.reduce((a,s) => a + s.capacity, 0);
  const totalUsed = doctorStats.reduce((a,s) => a + s.used, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-primary">الحجوزات</h2>
          <p className="text-sm text-muted-foreground">عرض السعة المتاحة لكل طبيب — اضغط على البطاقة للاطلاع على التفاصيل.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">عدد الأطباء</div><div className="text-2xl font-bold">{doctors.length}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><CalendarDays className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">السعة الإجمالية لليوم</div><div className="text-2xl font-bold">{totalCapacity}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">الحجوزات اليوم</div><div className="text-2xl font-bold">{totalUsed}</div></div></Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <div className="space-y-1 flex flex-col"><Label>&nbsp;</Label>
            <Button variant="ghost" onClick={() => { setDate(ymd(new Date())); setShiftFilter("all"); }}>إعادة الضبط</Button>
          </div>
        </div>
      </Card>

      {dow < 0 ? (
        <Card className="p-8 text-center text-muted-foreground">يوم الجمعة عطلة — لا توجد حجوزات.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctorStats.length === 0 && <Card className="p-8 text-center text-muted-foreground col-span-full">لا يوجد أطباء.</Card>}
          {doctorStats.map(({ doctor, capacity, used, remaining }) => {
            const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
            const full = capacity > 0 && remaining === 0;
            return (
              <Link key={doctor.id} to="/dashboard/doctor/$doctorId" params={{ doctorId: doctor.id }} className="group">
                <Card className="p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full flex flex-col justify-between border-2 hover:border-primary/40"
                  style={{ background: "var(--gradient-soft)" }}>
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-bold">د. {doctor.name}</div>
                        <div className="text-xs text-muted-foreground">{doctor.speciality}</div>
                      </div>
                      {doctor.is_paused && <span className="text-xs rounded-full bg-destructive/15 text-destructive px-2 py-0.5">موقوف</span>}
                      {full && !doctor.is_paused && <span className="text-xs rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5">مكتمل</span>}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">المتبقي</span>
                      <span className="text-3xl font-bold text-primary">{remaining}<span className="text-sm text-muted-foreground font-normal"> / {capacity}</span></span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>محجوز: {used}</span>
                      <span className="text-primary group-hover:underline">عرض الحجوزات ←</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
