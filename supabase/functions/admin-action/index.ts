// Admin CRUD edge function. Verifies the caller's JWT and admin role,
// then performs requested mutations using the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function randomToken(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "غير مصرّح" }, 401);

    const userClient = createClient(SUPA_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userRes?.user) return json({ error: "غير مصرّح" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPA_URL, SVC_KEY);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "صلاحيات المدير مطلوبة" }, 403);

    const { action, payload } = (await req.json()) ?? {};
    let result: any = { ok: true };

    switch (action) {
      // Doctors
      case "doctor.create": {
        const { data, error } = await admin.from("doctors").insert({
          name: payload.name, speciality: payload.speciality,
          allow_next_week: !!payload.allow_next_week,
          is_paused: !!payload.is_paused,
        }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "doctor.update": {
        const upd: any = {};
        ["name","speciality","allow_next_week","is_paused"].forEach(k => { if (k in payload) upd[k] = payload[k]; });
        const { data, error } = await admin.from("doctors").update(upd).eq("id", payload.id).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "doctor.delete": {
        const { error } = await admin.from("doctors").delete().eq("id", payload.id);
        if (error) throw error; break;
      }

      // Schedules
      case "schedule.upsert": {
        const { data, error } = await admin.from("schedules").upsert({
          doctor_id: payload.doctor_id,
          day_of_week: payload.day_of_week,
          shift: payload.shift,
          max_capacity: payload.max_capacity,
          is_paused: !!payload.is_paused,
        }, { onConflict: "doctor_id,day_of_week,shift" }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "schedule.update": {
        const upd: any = {};
        ["max_capacity","is_paused"].forEach(k => { if (k in payload) upd[k] = payload[k]; });
        const { data, error } = await admin.from("schedules").update(upd).eq("id", payload.id).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "schedule.delete": {
        const { error } = await admin.from("schedules").delete().eq("id", payload.id);
        if (error) throw error; break;
      }

      // Bookings
      case "booking.delete": {
        const { error } = await admin.from("bookings").delete().eq("id", payload.id);
        if (error) throw error; break;
      }
      case "booking.updateStatus": {
        const { data, error } = await admin.from("bookings").update({ status: payload.status }).eq("id", payload.id).select().single();
        if (error) throw error; result.data = data; break;
      }

      // WhatsApp instances
      case "wa.list": {
        const { data, error } = await admin.from("whatsapp_instances").select("*").order("created_at");
        if (error) throw error; result.data = data; break;
      }
      case "wa.create": {
        const { name, phone_number_id, access_token } = payload ?? {};
        if (!name || !phone_number_id || !access_token) return json({ error: "الحقول مطلوبة" }, 400);
        const { data, error } = await admin.from("whatsapp_instances").insert({
          name, phone_number_id, access_token,
          verify_token: payload.verify_token || randomToken(20),
          is_active: payload.is_active ?? true,
        }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "wa.update": {
        const upd: any = { updated_at: new Date().toISOString() };
        ["name","phone_number_id","access_token","verify_token","is_active"].forEach(k => { if (k in payload) upd[k] = payload[k]; });
        const { data, error } = await admin.from("whatsapp_instances").update(upd).eq("id", payload.id).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "wa.delete": {
        const { error } = await admin.from("whatsapp_instances").delete().eq("id", payload.id);
        if (error) throw error; break;
      }

      // Users
      case "user.create": {
        const { account_type, password, display_name } = payload ?? {};
        if (!password || password.length < 6) return json({ error: "كلمة المرور 6 أحرف على الأقل" }, 400);
        if (!display_name || String(display_name).trim().length < 2) return json({ error: "الاسم مطلوب" }, 400);

        let email = "";
        let username: string | null = null;
        const userMeta: Record<string, unknown> = { display_name: String(display_name).trim() };

        if (account_type === "admin") {
          email = String(payload.email ?? "").trim().toLowerCase();
          if (!email || !email.includes("@")) return json({ error: "بريد إلكتروني صالح مطلوب" }, 400);
          userMeta.role = "admin";
        } else {
          const cleanUser = String(payload.username ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
          if (cleanUser.length < 3) return json({ error: "اسم المستخدم 3 أحرف على الأقل" }, 400);
          email = `${cleanUser}@borg.local`;
          username = cleanUser;
          userMeta.username = cleanUser;
          userMeta.role = "receptionist";
        }

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: userMeta,
        });
        if (cErr) throw cErr;
        const newId = created.user!.id;
        await admin.from("user_roles").delete().eq("user_id", newId);
        const role = account_type === "admin" ? "admin" : "receptionist";
        const { error: rErr } = await admin.from("user_roles").insert({ user_id: newId, role });
        if (rErr) throw rErr;
        result.data = { id: newId, username, email, role };
        break;
      }
      case "user.list": {
        const { data: users } = await admin.auth.admin.listUsers();
        const { data: roles } = await admin.from("user_roles").select("user_id,role");
        const map = new Map<string, string[]>();
        (roles ?? []).forEach(r => {
          const list = map.get(r.user_id) ?? [];
          list.push(r.role); map.set(r.user_id, list);
        });
        result.data = (users.users ?? []).map(u => {
          const email = u.email ?? "";
          const isReception = email.endsWith("@borg.local");
          return {
            id: u.id,
            email,
            username: isReception ? email.replace(/@borg\.local$/, "") : null,
            display_name: (u.user_metadata as any)?.display_name ?? null,
            roles: map.get(u.id) ?? [],
          };
        });
        break;
      }
      case "user.delete": {
        if (payload.id === userId) return json({ error: "لا يمكن حذف حسابك" }, 400);
        const { error } = await admin.auth.admin.deleteUser(payload.id);
        if (error) throw error; break;
      }

      default:
        return json({ error: "إجراء غير معروف" }, 400);
    }
    return json(result);
  } catch (e) {
    console.error("admin-action error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
