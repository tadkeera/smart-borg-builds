// Admin CRUD edge function. Verifies admin password against app_settings,
// then performs requested mutation using the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json();
    const { username, password, action, payload } = body ?? {};

    const { data: settings, error: sErr } = await supabase
      .from("app_settings").select("*").eq("id", 1).single();
    if (sErr) throw sErr;

    // auth.login is the only action that accepts username+password (no prior session)
    if (action === "auth.login") {
      if (!username || !password || username !== settings.admin_username || password !== settings.admin_password) {
        return new Response(JSON.stringify({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true, username: settings.admin_username }), {
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (!password || password !== settings.admin_password) {
      return new Response(JSON.stringify({ error: "كلمة المرور غير صحيحة" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    let result: any = { ok: true };
    switch (action) {
      // Reads (admin-only)
      case "settings.get": {
        result.data = {
          whatsapp_token: settings.whatsapp_token ?? "",
          whatsapp_phone_number_id: settings.whatsapp_phone_number_id ?? "",
          whatsapp_verify_token: settings.whatsapp_verify_token ?? "",
          notify_phone: settings.notify_phone ?? "",
          admin_username: settings.admin_username,
        };
        break;
      }
      case "bookings.list": {
        const { data, error } = await supabase
          .from("bookings").select("*")
          .order("booking_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error; result.data = data; break;
      }
      // Doctors
      case "doctor.create": {
        const { data, error } = await supabase.from("doctors").insert({
          name: payload.name, speciality: payload.speciality
        }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "doctor.update": {
        const { data, error } = await supabase.from("doctors").update({
          name: payload.name, speciality: payload.speciality
        }).eq("id", payload.id).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "doctor.delete": {
        const { error } = await supabase.from("doctors").delete().eq("id", payload.id);
        if (error) throw error; break;
      }
      // Schedules
      case "schedule.upsert": {
        const { data, error } = await supabase.from("schedules").upsert({
          doctor_id: payload.doctor_id,
          day_of_week: payload.day_of_week,
          shift: payload.shift,
          max_capacity: payload.max_capacity,
        }, { onConflict: "doctor_id,day_of_week,shift" }).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "schedule.delete": {
        const { error } = await supabase.from("schedules").delete().eq("id", payload.id);
        if (error) throw error; break;
      }
      // Bookings
      case "booking.delete": {
        const { error } = await supabase.from("bookings").delete().eq("id", payload.id);
        if (error) throw error; break;
      }
      // Settings
      case "settings.update": {
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["whatsapp_token","whatsapp_phone_number_id","whatsapp_verify_token","notify_phone"]) {
          if (k in payload) upd[k] = payload[k];
        }
        const { data, error } = await supabase.from("app_settings").update(upd).eq("id", 1).select().single();
        if (error) throw error; result.data = data; break;
      }
      case "settings.changeCredentials": {
        const { new_username, new_password } = payload;
        if (!new_username || !new_password) throw new Error("بيانات ناقصة");
        const { data, error } = await supabase.from("app_settings").update({
          admin_username: new_username, admin_password: new_password, updated_at: new Date().toISOString()
        }).eq("id", 1).select().single();
        if (error) throw error; result.data = data; break;
      }
      default:
        return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("admin-action error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});