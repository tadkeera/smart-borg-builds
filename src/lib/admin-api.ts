import { supabase } from "@/integrations/supabase/client";

export async function adminAction(password: string, action: string, payload: any = {}) {
  const { data, error } = await supabase.functions.invoke("admin-action", {
    body: { password, action, payload },
  });
  if (error) {
    const ctx: any = (error as any).context;
    let msg = error.message;
    try { const j = await ctx?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function adminLogin(username: string, password: string) {
  const { data, error } = await supabase.functions.invoke("admin-action", {
    body: { username, password, action: "auth.login" },
  });
  if (error) {
    const ctx: any = (error as any).context;
    let msg = error.message;
    try { const j = await ctx?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { ok: true; username: string };
}

export const DAY_NAMES = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export const SHIFT_LABEL: Record<string, string> = { morning: "صباحي", evening: "مسائي" };