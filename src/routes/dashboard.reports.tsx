import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/RequireAuth";
import { Users, Activity, CalendarCheck, Trophy, RefreshCcw, FileText, FileSpreadsheet } from "lucide-react";
import { DAY_NAMES, SHIFT_LABEL } from "@/lib/admin-api";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/dashboard/reports")({
  component: () => <RequireAuth permission="reports"><ReportsPage /></RequireAuth>,
});

interface Doctor { id: string; name: string; speciality: string; }
interface Booking { id: string; doctor_id: string; booking_date: string; day_of_week: number; shift: string|null; status: string; patient_name: string; patient_phone: string|null; created_at: string; }

const ymd = (d: Date) => d.toISOString().slice(0,10);
const STATUS_LABEL: Record<string,string> = { confirmed:"مؤكد", completed:"مكتمل", cancelled:"ملغي" };
const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))", "#f59e0b", "#10b981"];

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

  const range = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    if (period === "custom") return { from: from || "0000-01-01", to: to || "9999-12-31" };
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

  const doctorMap = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors]);

  const perDoctor = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach(b => m.set(b.doctor_id, (m.get(b.doctor_id) ?? 0) + 1));
    return doctors.map(d => ({ doctor: d, count: m.get(d.id) ?? 0 })).sort((a,b) => b.count - a.count);
  }, [filtered, doctors]);

  const top5 = perDoctor.slice(0, 5);
  const top5Chart = top5.map(r => ({ name: `د. ${r.doctor.name}`, count: r.count }));

  const perDayChart = useMemo(() => {
    const arr = Array(6).fill(0).map((_, i) => ({ day: DAY_NAMES[i], morning: 0, evening: 0, total: 0 }));
    filtered.forEach(b => {
      if (b.day_of_week >= 0 && b.day_of_week < 6) {
        const row = arr[b.day_of_week];
        if (b.shift === "morning") row.morning++;
        else if (b.shift === "evening") row.evening++;
        row.total++;
      }
    });
    return arr;
  }, [filtered]);

  const shiftChart = useMemo(() => {
    const morning = filtered.filter(b => b.shift === "morning").length;
    const evening = filtered.filter(b => b.shift === "evening").length;
    return [
      { name: SHIFT_LABEL.morning, value: morning },
      { name: SHIFT_LABEL.evening, value: evening },
    ];
  }, [filtered]);

  const filterSummary = () =>
    `الفترة: ${range.from} إلى ${range.to}` +
    (doctorFilter !== "all" ? ` | الطبيب: د. ${doctorMap.get(doctorFilter)?.name ?? ""}` : "") +
    (statusFilter !== "all" ? ` | الحالة: ${STATUS_LABEL[statusFilter] ?? statusFilter}` : "") +
    (shiftFilter !== "all" ? ` | الفترة اليومية: ${SHIFT_LABEL[shiftFilter] ?? shiftFilter}` : "");

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["تقرير الحجوزات"], [filterSummary()], [],
      ["إجمالي الحجوزات", totalBookings],
      ["عدد المرضى", uniquePatients],
      ["مؤكد", confirmedCount], ["مكتمل", completedCount], ["ملغي", cancelledCount],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "ملخص");

    const perDocRows = [["الطبيب","التخصص","عدد الحجوزات"], ...perDoctor.map(r => [r.doctor.name, r.doctor.speciality, r.count])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perDocRows), "حسب الطبيب");

    const perDayRows = [["اليوم","صباحي","مسائي","الإجمالي"], ...perDayChart.map(r => [r.day, r.morning, r.evening, r.total])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perDayRows), "حسب اليوم");

    const bookingsRows = [["التاريخ","اليوم","الطبيب","المريض","الجوال","الفترة","الحالة"],
      ...filtered.map(b => [
        b.booking_date, DAY_NAMES[b.day_of_week] ?? "", doctorMap.get(b.doctor_id)?.name ?? "",
        b.patient_name, b.patient_phone ?? "", b.shift ? SHIFT_LABEL[b.shift] : "", STATUS_LABEL[b.status] ?? b.status,
      ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bookingsRows), "الحجوزات");

    XLSX.writeFile(wb, `report-${range.from}_${range.to}.xlsx`);
    toast.success("تم تصدير الملف");
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(14);
    doc.text("Bookings Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Range: ${range.from} -> ${range.to}`, 14, 22);
    doc.text(`Total: ${totalBookings}  |  Patients: ${uniquePatients}  |  Confirmed: ${confirmedCount}  Completed: ${completedCount}  Cancelled: ${cancelledCount}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [["Doctor","Speciality","Bookings"]],
      body: perDoctor.map(r => [r.doctor.name, r.doctor.speciality, String(r.count)]),
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      head: [["Date","Day","Doctor","Patient","Phone","Shift","Status"]],
      body: filtered.map(b => [
        b.booking_date, String(b.day_of_week), doctorMap.get(b.doctor_id)?.name ?? "",
        b.patient_name, b.patient_phone ?? "", b.shift ?? "", b.status,
      ]),
      styles: { fontSize: 8 },
    });

    doc.save(`report-${range.from}_${range.to}.pdf`);
    toast.success("تم تصدير الملف");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-primary">التقارير والإحصاءات</h2>
          <p className="text-sm text-muted-foreground">تحليل شامل للحجوزات وأداء الأطباء.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="h-4 w-4 ml-1" /> تحديث</Button>
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 ml-1" /> Excel</Button>
          <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 ml-1" /> PDF</Button>
        </div>
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
          <h3 className="font-bold mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> أفضل ٥ أطباء</h3>
          {top5Chart.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات.</p> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Chart} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold mb-3">توزيع الحجوزات حسب الفترة</h3>
          {filtered.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات.</p> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shiftChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {shiftChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-bold mb-3">توزيع الحجوزات حسب اليوم</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perDayChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="morning" name="صباحي" stackId="a" fill="hsl(var(--primary))" />
              <Bar dataKey="evening" name="مسائي" stackId="a" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

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
