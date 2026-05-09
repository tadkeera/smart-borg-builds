import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/dashboard/whatsapp")({
  component: () => <RequireAuth adminOnly><WhatsAppPage /></RequireAuth>
});

function WhatsAppPage() {
  useAuth();
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [verify, setVerify] = useState("");
  const [notify, setNotify] = useState("+967");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`;

  const load = async () => {
    try {
      const res: any = await adminAction("settings.get", {});
      const data = res?.data;
      if (data) {
        setToken(data.whatsapp_token ?? "");
        setPhoneId(data.whatsapp_phone_number_id ?? "");
        setVerify(data.whatsapp_verify_token ?? "");
        setNotify(data.notify_phone || "+967");
      }
    } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await adminAction("settings.update", {
        whatsapp_token: token,
        whatsapp_phone_number_id: phoneId,
        whatsapp_verify_token: verify,
        notify_phone: notify,
      });
      toast.success("تم حفظ الإعدادات");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-primary">إعدادات الواتساب</h2>
        <p className="text-sm text-muted-foreground">إعداد ربط واتساب كلاود (WhatsApp Cloud API).</p>
      </div>

      <Card className="p-4 space-y-3">
        <Label className="text-xs text-muted-foreground">رابط الويبهوك (Webhook URL) — استخدمه في إعدادات Meta</Label>
        <div className="flex gap-2">
          <Input value={webhookUrl} readOnly dir="ltr" className="font-mono text-xs" />
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("تم النسخ"); }}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <Label>WhatsApp Cloud API Token</Label>
          <Input value={token} onChange={e=>setToken(e.target.value)} dir="ltr" placeholder="EAAG..." />
        </div>
        <div className="space-y-2">
          <Label>Phone Number ID</Label>
          <Input value={phoneId} onChange={e=>setPhoneId(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>Verify Token (للتحقق من الويبهوك)</Label>
          <Input value={verify} onChange={e=>setVerify(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>رقم واتساب للتنبيهات (يبدأ بـ +967)</Label>
          <Input value={notify} onChange={e=>setNotify(e.target.value)} dir="ltr" placeholder="+967xxxxxxxxx" />
        </div>
        <Button onClick={save}>حفظ</Button>
      </Card>

      <Card className="p-4 text-sm space-y-2 bg-secondary/40">
        <div className="font-semibold">تعليمات الإعداد:</div>
        <ol className="list-decimal pr-6 space-y-1 text-muted-foreground">
          <li>أدخل التوكن ومعرّف الرقم من لوحة Meta for Developers.</li>
          <li>في إعدادات الويبهوك في Meta، الصق الرابط أعلاه واستخدم نفس Verify Token.</li>
          <li>اشترك في حدث messages.</li>
          <li>للتجربة، أرسل كلمة <strong>تسجيل</strong> من الواتساب إلى رقم النشاط.</li>
        </ol>
      </Card>
    </div>
  );
}