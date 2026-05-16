import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { adminAction } from "@/lib/admin-api";
import { RequireAuth } from "@/components/RequireAuth";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/doctors")({
  component: () => <RequireAuth adminOnly><DoctorsPage /></RequireAuth>
});

interface Doctor {
  id: string; name: string; speciality: string;
  allow_next_week: boolean; allow_two_weeks: boolean; is_paused: boolean;
  has_booking_limit: boolean;
}

function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [allowNext, setAllowNext] = useState(false);
  const [allowTwo, setAllowTwo] = useState(false);
  const [paused, setPaused] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("doctors").select("*").order("name");
    setDoctors((data ?? []) as Doctor[]);
  };
  useEffect(() => { load(); }, []);

  const startAdd = () => {
    setEditing(null); setName(""); setSpec(""); setAllowNext(false); setAllowTwo(false); setPaused(false); setOpen(true);
  };
  const startEdit = (d: Doctor) => {
    setEditing(d); setName(d.name); setSpec(d.speciality);
    setAllowNext(d.allow_next_week); setAllowTwo(d.allow_two_weeks); setPaused(d.is_paused); setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !spec.trim()) { toast.error("الاسم والتخصص مطلوبان"); return; }
    try {
      const payload: any = { name, speciality: spec, allow_next_week: allowNext, allow_two_weeks: allowTwo, is_paused: paused };
      if (editing) {
        await adminAction("doctor.update", { id: editing.id, ...payload });
        toast.success("تم التعديل");
      } else {
        await adminAction("doctor.create", payload);
        toast.success("تمت الإضافة");
      }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleField = async (d: Doctor, field: "allow_next_week" | "allow_two_weeks" | "is_paused", value: boolean) => {
    try { await adminAction("doctor.update", { id: d.id, [field]: value }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الطبيب وكل الجداول والحجوزات المرتبطة؟")) return;
    try { await adminAction("doctor.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">الأطباء</h2>
          <p className="text-sm text-muted-foreground">إدارة الأطباء والإعدادات الخاصة بكل طبيب.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startAdd}><Plus className="h-4 w-4 ml-1" /> إضافة طبيب</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل طبيب" : "إضافة طبيب"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={e=>setName(e.target.value)} /></div>
              <div className="space-y-2"><Label>التخصص</Label><Input value={spec} onChange={e=>setSpec(e.target.value)} /></div>
              <label className="flex items-center justify-between gap-2 rounded-md border p-3">
                <span className="text-sm">السماح بالحجز للأسبوع القادم</span>
                <Switch checked={allowNext} onCheckedChange={setAllowNext} />
              </label>
              <label className="flex items-center justify-between gap-2 rounded-md border p-3">
                <span className="text-sm">السماح بالحجز لمدة ١٤ يوم</span>
                <Switch checked={allowTwo} onCheckedChange={setAllowTwo} />
              </label>
              <label className="flex items-center justify-between gap-2 rounded-md border p-3">
                <span className="text-sm">إيقاف مؤقت لجميع الحجوزات لهذا الطبيب</span>
                <Switch checked={paused} onCheckedChange={setPaused} />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={save}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3 font-semibold">الاسم</th>
                <th className="p-3 font-semibold">التخصص</th>
                <th className="p-3 font-semibold">أسبوع قادم</th>
                <th className="p-3 font-semibold">١٤ يوم</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {doctors.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد أطباء بعد</td></tr>}
              {doctors.map(d => (
                <tr key={d.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">د. {d.name}</td>
                  <td className="p-3">{d.speciality}</td>
                  <td className="p-3"><Switch checked={d.allow_next_week} onCheckedChange={(v) => toggleField(d, "allow_next_week", v)} /></td>
                  <td className="p-3"><Switch checked={d.allow_two_weeks} onCheckedChange={(v) => toggleField(d, "allow_two_weeks", v)} /></td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2">
                      <Switch checked={!d.is_paused} onCheckedChange={(v) => toggleField(d, "is_paused", !v)} />
                      <span className="text-xs">{d.is_paused ? "موقوف" : "نشط"}</span>
                    </label>
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(d)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
