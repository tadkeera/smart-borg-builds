import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { adminAction } from "@/lib/admin-api";
import { RequireAuth } from "@/components/RequireAuth";
import { Plus, Trash2, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/whatsapp")({
  component: () => <RequireAuth adminOnly><WhatsAppPage /></RequireAuth>
});

interface WaInstance {
  id: string; name: string; phone_number_id: string;
  access_token: string; verify_token: string; is_active: boolean;
}

function genVerifyToken() {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function WhatsAppPage() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`;

  const [items, setItems] = useState<WaInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WaInstance | null>(null);
  const [name, setName] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [token, setToken] = useState("");
  const [verify, setVerify] = useState(genVerifyToken());
  const [active, setActive] = useState(true);

  const load = async () => {
    try {
      const res: any = await adminAction("wa.list", {});
      setItems(res?.data ?? []);
    } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const startAdd = () => {
    setEditing(null); setName(""); setPhoneId(""); setToken("");
    setVerify(genVerifyToken()); setActive(true); setOpen(true);
  };
  const startEdit = (w: WaInstance) => {
    setEditing(w); setName(w.name); setPhoneId(w.phone_number_id);
    setToken(w.access_token); setVerify(w.verify_token); setActive(w.is_active); setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !phoneId.trim() || !token.trim() || !verify.trim()) {
      toast.error("جميع الحقول مطلوبة"); return;
    }
    try {
      const payload = { name, phone_number_id: phoneId, access_token: token, verify_token: verify, is_active: active };
      if (editing) await adminAction("wa.update", { id: editing.id, ...payload });
      else await adminAction("wa.create", payload);
      toast.success("تم الحفظ");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (w: WaInstance) => {
    try { await adminAction("wa.update", { id: w.id, is_active: !w.is_active }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا الرقم نهائياً؟ سيتوقف الشات بوت عنه.")) return;
    try { await adminAction("wa.delete", { id }); toast.success("تم الحذف"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const copyText = (t: string) => { navigator.clipboard.writeText(t); toast.success("تم النسخ"); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">إعدادات الواتساب</h2>
          <p className="text-sm text-muted-foreground">إدارة عدة أرقام واتساب (Meta Cloud API).</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startAdd}><Plus className="h-4 w-4 ml-1" /> إضافة رقم</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "تعديل رقم" : "إضافة رقم واتساب"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>اسم الرقم (للعرض الداخلي)</Label>
                <Input value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: الفرع الرئيسي" />
              </div>
              <div className="space-y-2"><Label>Phone Number ID</Label>
                <Input dir="ltr" value={phoneId} onChange={e=>setPhoneId(e.target.value)} />
              </div>
              <div className="space-y-2"><Label>Permanent Access Token</Label>
                <Input dir="ltr" value={token} onChange={e=>setToken(e.target.value)} placeholder="EAAG..." />
              </div>
              <div className="space-y-2">
                <Label>Webhook Verify Token</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" value={verify} onChange={e=>setVerify(e.target.value)} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => setVerify(genVerifyToken())}>توليد</Button>
                </div>
              </div>
              <label className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">نشط (يستجيب الشات بوت)</span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={save}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 space-y-2">
        <Label className="text-xs text-muted-foreground">رابط الويبهوك (استخدمه في إعدادات Meta لكل رقم)</Label>
        <div className="flex gap-2">
          <Input value={webhookUrl} readOnly dir="ltr" className="font-mono text-xs" />
          <Button variant="outline" onClick={() => copyText(webhookUrl)}><Copy className="h-4 w-4" /></Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-right">
                <th className="p-3">الاسم</th>
                <th className="p-3">Phone Number ID</th>
                <th className="p-3">Verify Token</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد أرقام بعد</td></tr>}
              {items.map(w => (
                <tr key={w.id} className="border-t">
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{w.phone_number_id}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="sm" onClick={() => copyText(w.verify_token)} className="font-mono text-xs">
                      <Copy className="h-3 w-3 ml-1" /> نسخ
                    </Button>
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2">
                      <Switch checked={w.is_active} onCheckedChange={() => toggleActive(w)} />
                      <span className="text-xs">{w.is_active ? "نشط" : "متوقف"}</span>
                    </label>
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(w)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(w.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 text-sm space-y-2 bg-secondary/40">
        <div className="font-semibold">تعليمات الإعداد لكل رقم:</div>
        <ol className="list-decimal pr-6 space-y-1 text-muted-foreground">
          <li>في Meta for Developers، انسخ Phone Number ID و Permanent Access Token.</li>
          <li>أنشئ السجل هنا واحفظ Verify Token الذي يولّده النظام.</li>
          <li>في إعدادات الويبهوك في Meta، الصق رابط الويبهوك أعلاه واستخدم نفس Verify Token.</li>
          <li>اشترك في حدث <strong>messages</strong>.</li>
          <li>للتجربة، أرسل كلمة <strong>تسجيل</strong> من الواتساب إلى رقم النشاط.</li>
        </ol>
      </Card>
    </div>
  );
}
