import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus, KeyRound } from "lucide-react";

export const Route = createFileRoute("/dashboard/account")({
  component: () => <RequireAuth adminOnly><AccountPage /></RequireAuth>
});

interface ManagedUser { id: string; email: string; username: string | null; roles: string[] }

function AccountPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [creating, setCreating] = useState(false);

  // Change own password
  const [newPass, setNewPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await adminAction("user.list", {});
      setUsers(res?.data ?? []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createReceptionist = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (u.length < 3) { toast.error("اسم المستخدم 3 أحرف على الأقل (إنجليزية/أرقام)"); return; }
    if (pass.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    setCreating(true);
    try {
      await adminAction("user.createReceptionist", { username: u, password: pass });
      toast.success("تم إنشاء حساب موظف الاستقبال");
      setUsername(""); setPass("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const removeUser = async (id: string) => {
    if (!confirm("حذف هذا الحساب نهائياً؟")) return;
    try { await adminAction("user.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const changeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setNewPass("");
      toast.success("تم تحديث كلمة المرور");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPass(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-primary">الحسابات والصلاحيات</h2>
        <p className="text-sm text-muted-foreground">إدارة حسابات موظفي الاستقبال وكلمة مرور المدير.</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> إضافة موظف استقبال</div>
        <form onSubmit={createReceptionist} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2 sm:col-span-1">
            <Label>البريد الإلكتروني</Label>
            <Input type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label>كلمة المرور</Label>
            <Input type="text" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={creating} className="w-full">
              {creating && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} إنشاء
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">يمنح موظف الاستقبال صلاحيات قراءة الحجوزات والأطباء فقط — لا يستطيع التعديل أو الحذف.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b font-semibold">المستخدمون</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3">البريد</th>
                <th className="p-3">الدور</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-mono text-xs" dir="ltr">{u.email}</td>
                  <td className="p-3">
                    {u.roles.includes("admin") ? "مدير النظام" : u.roles.includes("receptionist") ? "موظف استقبال" : "—"}
                  </td>
                  <td className="p-3">
                    {u.id !== user?.id && !u.roles.includes("admin") && (
                      <Button size="sm" variant="ghost" onClick={() => removeUser(u.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> تغيير كلمة المرور الخاصة بي</div>
        <form onSubmit={changeMyPassword} className="space-y-3">
          <div className="space-y-2">
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" disabled={savingPass}>
            {savingPass && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} حفظ
          </Button>
        </form>
      </Card>
    </div>
  );
}
