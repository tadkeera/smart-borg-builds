import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/doctors")({
  component: () => <RequireAuth adminOnly><DoctorsPage /></RequireAuth>
});

interface Doctor { id: string; name: string; speciality: string; }

function DoctorsPage() {
  const { session } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");

  const load = async () => {
    const { data } = await supabase.from("doctors").select("*").order("name");
    setDoctors(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const startAdd = () => { setEditing(null); setName(""); setSpec(""); setOpen(true); };
  const startEdit = (d: Doctor) => { setEditing(d); setName(d.name); setSpec(d.speciality); setOpen(true); };

  const save = async () => {
    if (!name.trim() || !spec.trim()) { toast.error("الاسم والتخصص مطلوبان"); return; }
    try {
      if (editing) {
        await adminAction(session!.password!, "doctor.update", { id: editing.id, name, speciality: spec });
        toast.success("تم التعديل");
      } else {
        await adminAction(session!.password!, "doctor.create", { name, speciality: spec });
        toast.success("تمت الإضافة");
      }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الطبيب وكل الجداول والحجوزات المرتبطة؟")) return;
    try { await adminAction(session!.password!, "doctor.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">الأطباء</h2>
          <p className="text-sm text-muted-foreground">إدارة قائمة الأطباء وتخصصاتهم.</p>
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
                <th className="p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {doctors.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">لا يوجد أطباء بعد</td></tr>}
              {doctors.map(d => (
                <tr key={d.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">د. {d.name}</td>
                  <td className="p-3">{d.speciality}</td>
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