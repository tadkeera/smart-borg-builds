import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/dashboard" }); }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      toast.success("تم تسجيل الدخول");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "فشل تسجيل الدخول");
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      toast.success("تم إنشاء الحساب — تحقق من بريدك لتفعيله ثم سجّل الدخول");
    } catch (err: any) {
      toast.error(err.message || "فشل إنشاء الحساب");
    } finally { setLoading(false); }
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
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
            <TabsTrigger value="signup">إنشاء حساب</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                دخول
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={6} />
              </div>
              <p className="text-xs text-muted-foreground">
                أول مستخدم يسجّل في النظام يصبح <strong>مدير النظام</strong> تلقائياً.
                المدير يُنشئ بعد ذلك حسابات موظفي الاستقبال من صفحة <em>الحسابات</em>.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                إنشاء حساب
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
