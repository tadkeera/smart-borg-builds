import { supabase } from "@/integrations/supabase/client";

/**
 * Calls the admin-action edge function. Authorization is the user's
 * Supabase JWT (forwarded automatically by supabase.functions.invoke).
 * The edge function verifies the user is an admin via user_roles.
 */
export async function adminAction(action: string, payload: any = {}) {
  const { data, error } = await supabase.functions.invoke("admin-action", {
    body: { action, payload },
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

export const DAY_NAMES = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export const SHIFT_LABEL: Record<string, string> = { morning: "صباحي", evening: "مسائي" };
