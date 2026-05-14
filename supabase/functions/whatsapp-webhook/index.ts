// WhatsApp Cloud API webhook for hospital booking chatbot — multi-instance.
// Routes incoming events by phone_number_id to the matching whatsapp_instances row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_NAMES = ["السبت","الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس"];
const DAY_LOOKUP: Record<string, number> = {
  "السبت":0,"سبت":0,
  "الاحد":1,"الأحد":1,"احد":1,"أحد":1,
  "الاثنين":2,"الإثنين":2,"اثنين":2,"إثنين":2,
  "الثلاثاء":3,"ثلاثاء":3,
  "الاربعاء":4,"الأربعاء":4,"اربعاء":4,"أربعاء":4,
  "الخميس":5,"خميس":5,
};
const SHIFT_AR: Record<string,string> = { morning: "صباحي", evening: "مسائي" };

function normalize(s: string) {
  return s.trim().replace(/[ـ]/g,"").replace(/\s+/g," ");
}

// Saturday-start week. JS getDay: Sun=0..Sat=6 → ours: Sat=0..Thu=5 (Fri excluded)
function jsDayToAr(jsDay: number): number {
  // Sat=6→0, Sun=0→1, Mon=1→2, Tue=2→3, Wed=3→4, Thu=4→5, Fri=5→-1
  const m = [1,2,3,4,5,-1,0];
  return m[jsDay];
}

function startOfWeekSaturday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0,0,0,0);
  // back up to most recent Saturday
  const back = (out.getDay() + 1) % 7; // Sat=6→0, Sun=0→1, Mon=1→2 ...
  out.setDate(out.getDate() - back);
  return out;
}

function ymd(d: Date) { return d.toISOString().slice(0,10); }

// Returns array of { dow, date } pairs for the requested week
function weekDates(weekOffset: 0 | 1): { dow: number; date: string }[] {
  const start = startOfWeekSaturday(new Date());
  start.setDate(start.getDate() + weekOffset * 7);
  const out: { dow: number; date: string }[] = [];
  for (let i = 0; i < 6; i++) { // Sat..Thu (skip Friday at index 6)
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ dow: i, date: ymd(d) });
  }
  return out;
}

async function sendWhatsApp(token: string, phoneId: string, to: string, body: string) {
  if (!token || !phoneId) {
    console.warn("WhatsApp not configured; would send to", to, ":", body);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "text", text: { body }
    })
  });
  if (!res.ok) console.error("WhatsApp send failed:", await res.text());
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verification (GET): match the verify_token against ANY active instance
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const t = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !t) return new Response("forbidden", { status: 403 });
    const { data } = await supabase.from("whatsapp_instances")
      .select("id").eq("verify_token", t).eq("is_active", true).maybeSingle();
    if (data) return new Response(challenge ?? "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json();
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const incomingPhoneId: string | undefined = change?.metadata?.phone_number_id;
    const msg = change?.messages?.[0];
    if (!msg || !incomingPhoneId) return new Response("ignored", { status: 200 });

    // Route to instance
    const { data: instance } = await supabase.from("whatsapp_instances")
      .select("*").eq("phone_number_id", incomingPhoneId).maybeSingle();
    if (!instance) {
      console.warn("No instance for phone_number_id", incomingPhoneId);
      return new Response("no instance", { status: 200 });
    }
    if (!instance.is_active) {
      return new Response("instance inactive", { status: 200 });
    }
    const token = instance.access_token as string;
    const phoneId = instance.phone_number_id as string;

    const from: string = msg.from;
    const text: string = normalize(msg.text?.body ?? "");

    const { data: sess } = await supabase.from("chat_sessions").select("*").eq("phone", from).maybeSingle();
    let state: any = sess?.state ?? { step: "idle" };

    const reply = (m: string) => sendWhatsApp(token, phoneId, from, m);
    const save = async (s: any) => {
      await supabase.from("chat_sessions").upsert({ phone: from, state: s, updated_at: new Date().toISOString() });
    };
    const reset = () => save({ step: "idle" });

    if (text === "تسجيل" || text.toLowerCase() === "registration") {
      const { data: doctors } = await supabase.from("doctors")
        .select("id,name,speciality,allow_next_week,is_paused")
        .eq("is_paused", false)
        .order("created_at");
      if (!doctors || doctors.length === 0) {
        await reply("عذراً، لا يوجد أطباء متاحون حالياً.");
        await reset();
        return new Response("ok");
      }
      const list = doctors.map((d, i) => `${i+1}- د. ${d.name} (${d.speciality})`).join("\n");
      await reply(`أهلاً بك في مستشفى برج الأطباء. الرجاء إرسال رقم الطبيب الذي تريد التسجيل لديه:\n\n${list}`);
      await save({ step: "await_doctor", doctors: doctors.map(d => d.id), instance_id: instance.id });
      return new Response("ok");
    }

    switch (state.step) {
      case "await_doctor": {
        const n = parseInt(text, 10);
        if (!n || n < 1 || n > (state.doctors?.length ?? 0)) {
          await reply("الرجاء إرسال رقم صحيح من القائمة.");
          break;
        }
        const doctorId = state.doctors[n-1];
        const { data: doc } = await supabase.from("doctors").select("*").eq("id", doctorId).single();
        if (!doc || doc.is_paused) {
          await reply("هذا الطبيب غير متاح حالياً. أرسل 'تسجيل' لاختيار آخر.");
          await reset(); break;
        }
        const { data: schedules } = await supabase.from("schedules")
          .select("*").eq("doctor_id", doctorId).eq("is_paused", false);
        if (!schedules || schedules.length === 0) {
          await reply("عذراً، لا يوجد جدول عمل لهذا الطبيب حالياً. أرسل 'تسجيل'.");
          await reset(); break;
        }

        // Build available dates (current week, optional next week)
        const weeksToCheck: (0|1)[] = doc.allow_next_week ? [0,1] : [0];
        const todayStr = ymd(new Date());
        const offered: { dow: number; date: string; shifts: string[] }[] = [];
        for (const w of weeksToCheck) {
          for (const { dow, date } of weekDates(w)) {
            if (date < todayStr) continue; // skip past dates this week
            const matching = schedules.filter(s => s.day_of_week === dow);
            if (matching.length === 0) continue;
            offered.push({ dow, date, shifts: matching.map(s => SHIFT_AR[s.shift]) });
          }
        }

        if (offered.length === 0) {
          await reply("لا توجد مواعيد متاحة حالياً.");
          await reset(); break;
        }

        const lines = offered.map((o, i) =>
          `${i+1}- ${DAY_NAMES[o.dow]} ${o.date} — ${o.shifts.join(" / ")}`
        ).join("\n");
        await reply(`أيام عمل د. ${doc.name}:\n${lines}\n\nالرجاء إرسال رقم الموعد.`);
        await save({
          step: "await_day", doctor_id: doctorId,
          offered, instance_id: instance.id,
        });
        break;
      }
      case "await_day": {
        let pick: { dow: number; date: string; shifts: string[] } | null = null;
        const n = parseInt(text, 10);
        if (n && state.offered && n >= 1 && n <= state.offered.length) {
          pick = state.offered[n-1];
        } else {
          // fallback: try day name → first matching offered date
          const dow = DAY_LOOKUP[text];
          if (dow !== undefined) pick = (state.offered ?? []).find((o: any) => o.dow === dow) ?? null;
        }
        if (!pick) {
          await reply("الرجاء إرسال رقم من القائمة.");
          break;
        }

        const { data: sched } = await supabase.from("schedules")
          .select("*")
          .eq("doctor_id", state.doctor_id)
          .eq("day_of_week", pick.dow)
          .eq("is_paused", false)
          .limit(1).maybeSingle();
        if (!sched) { await reply("لم يعد هذا اليوم متاحاً."); break; }

        const { count } = await supabase.from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", state.doctor_id)
          .eq("booking_date", pick.date);
        const used = count ?? 0;
        if (used >= sched.max_capacity) {
          await reply("اكتمل التسجيل في هذا اليوم، الرجاء اختيار يوم آخر.");
          break;
        }
        await reply("يوجد متسع، الرجاء كتابة اسم المريض الرباعي لتأكيد الحجز.");
        await save({
          step: "await_name",
          doctor_id: state.doctor_id,
          day_of_week: pick.dow,
          date: pick.date,
          shift: sched.shift,
          instance_id: state.instance_id,
        });
        break;
      }
      case "await_name": {
        if (text.length < 5) { await reply("الرجاء إدخال الاسم الرباعي كاملاً."); break; }
        const { error } = await supabase.from("bookings").insert({
          doctor_id: state.doctor_id,
          patient_name: text,
          patient_phone: from,
          booking_date: state.date,
          day_of_week: state.day_of_week,
          shift: state.shift,
          source: "whatsapp",
          status: "confirmed",
          whatsapp_instance_id: state.instance_id ?? null,
        });
        if (error) {
          console.error(error);
          await reply("حدث خطأ أثناء حفظ الحجز. الرجاء المحاولة لاحقاً.");
          await reset(); break;
        }
        await reply(`تم تأكيد الحجز بنجاح. موعدك هو ( ${DAY_NAMES[state.day_of_week]} ) الموافق ( ${state.date} )، نتمنى لكم دوام الصحة والعافية.`);
        await reset();
        break;
      }
      default:
        await reply("للتسجيل في مستشفى برج الأطباء، الرجاء إرسال كلمة: تسجيل");
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("error", { status: 200 });
  }
});
