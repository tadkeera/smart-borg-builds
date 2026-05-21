import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus, KeyRound } from "lucide-react";

export const Route = createFileRoute("/dashboard/account")({
  component: () => <RequireAuth adminOnly><AccountPage /></RequireAuth>
});

import { Permissions } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";

interface ManagedUser {
  id: string; email: string; username: string | null;
  display_name: string | null; roles: string[];
  permissions: Permissions | null;
}

const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  index: "الرئيسية",
  doctors: "الأطباء",
  schedules: "الجداول",
  whatsapp: "الواتساب",
  reports: "التقارير",
  audit: "السجلات",
  account: "الحساب",
};

function AccountPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);

  // create user form
  const [accountType, setAccountType] = useState<"admin" | "receptionist">("receptionist");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [creating, setCreating] = useState(false);

  // self password
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

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) { toast.error("الاسم مطلوب"); return; }
    if (pass.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    const payload: any = { account_type: accountType, password: pass, display_name: displayName.trim() };
    if (accountType === "admin") {
      if (!email.includes("@")) { toast.error("بريد إلكتروني صالح مطلوب"); return; }
      payload.email = email.trim().toLowerCase();
    } else {
      const u = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (u.length < 3) { toast.error("اسم المستخدم 3 أحرف على الأقل"); return; }
      payload.username = u;
    }
    setCreating(true);
    try {
      await adminAction("user.create", payload);
      toast.success("تم إنشاء الحساب");
      setDisplayName(""); setUsername(""); setEmail(""); setPass("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const removeUser = async (id: string) => {
    if (!confirm("حذف هذا الحساب نهائياً؟")) return;
    try { await adminAction("user.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const updatePermissions = async (user: ManagedUser, key: keyof Permissions, value: boolean) => {
    const newPerms = { ...(user.permissions || {
      index: true, doctors: true, schedules: true, whatsapp: true, reports: true, audit: true, account: true
    }), [key]: value };
    
    try {
      await adminAction("user.update", { id: user.id, permissions: newPerms });
      toast.success("تم تحديث الصلاحيات");
      load();
    } catch (e: any) { toast.error(e.message); }
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
        <p className="text-sm text-muted-foreground">إدارة المستخدمين: مدير النظام (صلاحيات كاملة) أو موظف استقبال (قراءة فقط).</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> إضافة مستخدم</div>
        <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>نوع الحساب</Label>
            <Select value={accountType} onValueChange={(v: any) => setAccountType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">مدير النظام</SelectItem>
                <SelectItem value="receptionist">موظف استقبال</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الاسم الكامل</Label>
            <Input value={displayName} onChange={e=>setDisplayName(e.target.value)} required />
          </div>
          {accountType === "admin" ? (
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} required />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input dir="ltr" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} placeholder="username" />
            </div>
          )}
          <div className="space-y-2">
            <Label>كلمة المرور</Label>
            <Input type="text" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} إنشاء
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          المدير: صلاحيات كاملة. موظف الاستقبال: عرض الحجوزات والجداول فقط بدون إضافة/تعديل/حذف.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b font-semibold">المستخدمون</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3">الاسم</th>
                <th className="p-3">الدخول</th>
                <th className="p-3">الدور</th>
                <th className="p-3">الصلاحيات (للموظف)</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 align-top">{u.display_name ?? "—"}</td>
                  <td className="p-3 align-top font-mono text-xs" dir="ltr">{u.username ?? u.email}</td>
                  <td className="p-3 align-top">
                    {u.roles.includes("admin") ? "مدير النظام" : u.roles.includes("receptionist") ? "موظف استقبال" : "—"}
                  </td>
                  <td className="p-3">
                    {u.roles.includes("receptionist") && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {(Object.keys(PERMISSION_LABELS) as Array<keyof Permissions>).map(key => (
                          <div key={key} className="flex items-center gap-2">
                            <Checkbox 
                              id={`perm-${u.id}-${key}`}
                              checked={u.permissions?.[key] ?? true}
                              onCheckedChange={(checked) => updatePermissions(u, key, !!checked)}
                            />
                            <Label htmlFor={`perm-${u.id}-${key}`} className="text-[10px] cursor-pointer">
                              {PERMISSION_LABELS[key]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                    {u.roles.includes("admin") && <span className="text-xs text-muted-foreground italic">صلاحيات كاملة</span>}
                  </td>
                  <td className="p-3 align-top">
                    {u.id !== user?.id && (
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
