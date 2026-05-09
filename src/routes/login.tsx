import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [recName, setRecName] = useState("");
  const [loading, setLoading] = useState(false);

  const adminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.from("app_settings").select("admin_username,admin_password").eq("id", 1).single();
      if (error) throw error;
      if (adminUser === data.admin_username && adminPass === data.admin_password) {
        login({ role: "admin", name: adminUser, password: adminPass });
        toast.success("مرحباً بك يا مدير النظام");
        navigate({ to: "/dashboard" });
      } else {
        toast.error("اسم المستخدم أو كلمة المرور غير صحيحة");
      }
    } catch (err: any) {
      toast.error(err.message || "خطأ في تسجيل الدخول");
    } finally { setLoading(false); }
  };

  const recLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (recName.trim().length < 2) { toast.error("الرجاء إدخال الاسم"); return; }
    login({ role: "receptionist", name: recName.trim() });
    toast.success(`مرحباً ${recName.trim()}`);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
         style={{ background: "var(--gradient-soft)" }}>
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-xl border-primary/10">
        <div className="flex flex-col items-center gap-3 mb-6">
          <Logo size={88} />
          <h1 className="text-xl sm:text-2xl font-bold text-primary text-center">
            نظام إدارة التسجيل
          </h1>
          <p className="text-sm text-muted-foreground text-center">مستشفى برج الأطباء</p>
        </div>
        <Tabs defaultValue="admin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="admin">مدير النظام</TabsTrigger>
            <TabsTrigger value="receptionist">موظف الاستقبال</TabsTrigger>
          </TabsList>
          <TabsContent value="admin">
            <form onSubmit={adminLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>اسم المستخدم</Label>
                <Input value={adminUser} onChange={e => setAdminUser(e.target.value)} required autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                دخول
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="receptionist">
            <form onSubmit={recLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>اسم الموظف</Label>
                <Input value={recName} onChange={e => setRecName(e.target.value)} required placeholder="أدخل اسمك الكامل" />
              </div>
              <p className="text-xs text-muted-foreground">صلاحيات القراءة فقط — لا يمكن إضافة أو تعديل أو حذف أي بيانات.</p>
              <Button type="submit" className="w-full">دخول</Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}