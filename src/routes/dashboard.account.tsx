import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/account")({
  component: () => <RequireAuth adminOnly><AccountPage /></RequireAuth>
});

function AccountPage() {
  const { session, login } = useAuth();
  const [u, setU] = useState(session?.name || "");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !p1) { toast.error("الحقول مطلوبة"); return; }
    if (p1 !== p2) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setLoading(true);
    try {
      await adminAction(session!.password!, "settings.changeCredentials", { new_username: u, new_password: p1 });
      login({ role: "admin", name: u, password: p1 });
      setP1(""); setP2("");
      toast.success("تم تحديث بيانات الدخول");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">حساب المدير</h2>
        <p className="text-sm text-muted-foreground">تغيير اسم المستخدم وكلمة المرور.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>اسم المستخدم الجديد</Label><Input value={u} onChange={e=>setU(e.target.value)} /></div>
          <div className="space-y-2"><Label>كلمة المرور الجديدة</Label><Input type="password" value={p1} onChange={e=>setP1(e.target.value)} /></div>
          <div className="space-y-2"><Label>تأكيد كلمة المرور</Label><Input type="password" value={p2} onChange={e=>setP2(e.target.value)} /></div>
          <Button type="submit" disabled={loading}>حفظ</Button>
        </form>
      </Card>
    </div>
  );
}