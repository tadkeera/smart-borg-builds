import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminAction, DAY_NAMES, SHIFT_LABEL } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/schedules")({
  component: () => <RequireAuth adminOnly><SchedulesPage /></RequireAuth>
});

interface Doctor { id: string; name: string; }
interface Schedule { id: string; doctor_id: string; day_of_week: number; shift: "morning"|"evening"; max_capacity: number; }

function SchedulesPage() {
  const { session } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [day, setDay] = useState<string>("0");
  const [shift, setShift] = useState<"morning"|"evening">("morning");
  const [cap, setCap] = useState<number>(20);

  const load = async () => {
    const [d, s] = await Promise.all([
      supabase.from("doctors").select("id,name").order("name"),
      supabase.from("schedules").select("*"),
    ]);
    setDoctors(d.data ?? []);
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
      toast.success("تم الحفظ");
      load();
    } catch (e: any) { toast.error(e.message); }
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
        <p className="text-sm text-muted-foreground">حدد أيام العمل، الفترات، والسعة اليومية لكل طبيب.</p>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">إضافة / تحديث موعد</h3>
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
          <Card key={doctor.id} className="p-4">
            <h3 className="font-semibold mb-3">د. {doctor.name}</h3>
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