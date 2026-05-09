import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

// Synthetic email domain used for receptionist usernames.
// Must match the value used in supabase/functions/admin-action/index.ts
const RECEPTION_DOMAIN = "borg.local";

function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<"admin" | "receptionist">("admin");
  const [identifier, setIdentifier] = useState(""); // email for admin, username for receptionist
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/dashboard" }); }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const id = identifier.trim();
      const email = accountType === "admin"
        ? id
        : `${id.toLowerCase().replace(/[^a-z0-9_.-]/g, "")}@${RECEPTION_DOMAIN}`;
      await signIn(email, password);
      toast.success("تم تسجيل الدخول");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "فشل تسجيل الدخول");
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

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label>نوع الحساب</Label>
            <RadioGroup
              value={accountType}
              onValueChange={(v) => { setAccountType(v as any); setIdentifier(""); }}
              className="grid grid-cols-2 gap-2"
            >
              <label
                htmlFor="t-admin"
                className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors ${accountType === "admin" ? "border-primary bg-primary/5" : "border-input"}`}
              >
                <RadioGroupItem id="t-admin" value="admin" />
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">مدير النظام</span>
              </label>
              <label
                htmlFor="t-rec"
                className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors ${accountType === "receptionist" ? "border-primary bg-primary/5" : "border-input"}`}
              >
                <RadioGroupItem id="t-rec" value="receptionist" />
                <UserCog className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">موظف استقبال</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>{accountType === "admin" ? "البريد الإلكتروني" : "اسم المستخدم"}</Label>
            <Input
              type={accountType === "admin" ? "email" : "text"}
              dir="ltr"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
              autoComplete={accountType === "admin" ? "email" : "username"}
              placeholder={accountType === "admin" ? "name@example.com" : "username"}
            />
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
      </Card>
    </div>
  );
}
