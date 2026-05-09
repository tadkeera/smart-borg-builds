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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "غير مصرّح" }, 401);

    // Validate the user from the JWT
    const userClient = createClient(SUPA_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userRes?.user) return json({ error: "غير مصرّح" }, 401);
    const userId = userRes.user.id;

    // Check admin role with service role (bypasses RLS)
    const admin = createClient(SUPA_URL, SVC_KEY);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "صلاحيات المدير مطلوبة" }, 403);

    const { action, payload } = (await req.json()) ?? {};
    let result: any = { ok: true };

    switch (action) {
      case "settings.get": {
        const { data, error } = await admin.from("app_settings").select("*").eq("id", 1).single();
        if (error) throw error;
        result.data = {
          whatsapp_token: data.whatsapp_token ?? "",
          whatsapp_phone_number_id: data.whatsapp_phone_number_id ?? "",
          whatsapp_verify_token: data.whatsapp_verify_token ?? "",
          notify_phone: data.notify_phone ?? "",
        };
        break;
      }
      case "settings.update": {
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["whatsapp_token","whatsapp_phone_number_id","whatsapp_verify_token","notify_phone"]) {
          if (k in payload) upd[k] = payload[k];
        }
        const { data, error } = await admin.from("app_settings").update(upd).eq("id", 1).select().single();
        if (error) throw error; result.data = data; break;
      }

      // Doctors
      case "doctor.create": {
        const { data, error } = await admin.from("doctors").insert({
          name: payload.name, speciality: payload.speciality
        }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "doctor.update": {
        const { data, error } = await admin.from("doctors").update({
          name: payload.name, speciality: payload.speciality
        }).eq("id", payload.id).select().single();
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
        }, { onConflict: "doctor_id,day_of_week,shift" }).select().single();
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

      // User management — invite a receptionist (login by username)
      case "user.createReceptionist": {
        const { username, password } = payload ?? {};
        const cleanUser = String(username ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
        if (!cleanUser || !password) return json({ error: "اسم المستخدم وكلمة المرور مطلوبان" }, 400);
        if (cleanUser.length < 3) return json({ error: "اسم المستخدم 3 أحرف على الأقل" }, 400);
        const email = `${cleanUser}@borg.local`;
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { username: cleanUser, role: "receptionist" },
        });
        if (cErr) throw cErr;
        const newId = created.user!.id;
        await admin.from("user_roles").delete().eq("user_id", newId);
        const { error: rErr } = await admin.from("user_roles").insert({ user_id: newId, role: "receptionist" });
        if (rErr) throw rErr;
        result.data = { id: newId, username: cleanUser };
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
