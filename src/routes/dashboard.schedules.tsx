import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminAction, DAY_NAMES, SHIFT_LABEL } from "@/lib/admin-api";
import { RequireAuth } from "@/components/RequireAuth";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/schedules")({
  component: () => <RequireAuth adminOnly><SchedulesPage /></RequireAuth>
});

interface Doctor { id: string; name: string; allow_next_week: boolean; }
interface Schedule {
  id: string; doctor_id: string; day_of_week: number;
  shift: "morning"|"evening"; max_capacity: number; is_paused: boolean;
}

function SchedulesPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [day, setDay] = useState<string>("0");
  const [shift, setShift] = useState<"morning"|"evening">("morning");
  const [cap, setCap] = useState<number>(20);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCap, setEditCap] = useState<number>(0);

  const load = async () => {
    const [d, s] = await Promise.all([
      supabase.from("doctors").select("id,name,allow_next_week").order("name"),
      supabase.from("schedules").select("*"),
    ]);
    setDoctors((d.data ?? []) as Doctor[]);
    setSchedules((s.data ?? []) as Schedule[]);
    if (!doctorId && d.data?.[0]) setDoctorId(d.data[0].id);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!doctorId) { toast.error("اختر طبيباً"); return; }
    try {
      await adminAction("schedule.upsert", {
        doctor_id: doctorId, day_of_week: parseInt(day), shift, max_capacity: cap,
      });
      toast.success("تم الحفظ"); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const togglePause = async (s: Schedule) => {
    try { await adminAction("schedule.update", { id: s.id, is_paused: !s.is_paused }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleAllowNextWeek = async (d: Doctor) => {
    try { await adminAction("doctor.update", { id: d.id, allow_next_week: !d.allow_next_week }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا الموعد؟")) return;
    try { await adminAction("schedule.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const grouped = doctors.map(d => ({ doctor: d, items: schedules.filter(s => s.doctor_id === d.id) }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">جداول العمل</h2>
        <p className="text-sm text-muted-foreground">
          أيام الأسبوع تبدأ السبت وتنتهي الخميس. السعة تتجدد تلقائياً كل أسبوع.
        </p>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">إضافة / تحديث موعد متكرر أسبوعياً</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label>الطبيب</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {doctors.map(d => <SelectItem key={d.id} value={d.id}>د. {d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>اليوم</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((n, i) => <SelectItem key={i} value={String(i)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>الفترة</Label>
            <Select value={shift} onValueChange={(v: any)=>setShift(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">صباحي</SelectItem>
                <SelectItem value="evening">مسائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>السعة القصوى</Label>
            <Input type="number" min={0} value={cap} onChange={e=>setCap(parseInt(e.target.value)||0)} />
          </div>
        </div>
        <div className="mt-4"><Button onClick={save}>حفظ الموعد</Button></div>
      </Card>

      <div className="space-y-4">
        {grouped.length === 0 && <Card className="p-6 text-center text-muted-foreground">أضف طبيباً أولاً.</Card>}
        {grouped.map(({ doctor, items }) => (
          <Card key={doctor.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold">د. {doctor.name}</h3>
              <label className="inline-flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                <Switch checked={doctor.allow_next_week} onCheckedChange={() => toggleAllowNextWeek(doctor)} />
                السماح بالحجز للأسبوع القادم
              </label>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مواعيد محددة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60">
                    <tr className="text-right">
                      <th className="p-2">اليوم</th>
                      <th className="p-2">الفترة</th>
                      <th className="p-2">السعة</th>
                      <th className="p-2">الحالة</th>
                      <th className="p-2">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.sort((a,b)=>a.day_of_week-b.day_of_week).map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="p-2">{DAY_NAMES[s.day_of_week]}</td>
                        <td className="p-2">{SHIFT_LABEL[s.shift]}</td>
                        <td className="p-2 font-semibold">{s.max_capacity}</td>
                        <td className="p-2">
                          <label className="inline-flex items-center gap-2">
                            <Switch checked={!s.is_paused} onCheckedChange={() => togglePause(s)} />
                            <span className="text-xs">{s.is_paused ? "موقوف" : "نشط"}</span>
                          </label>
                        </td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
