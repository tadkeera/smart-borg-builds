// WhatsApp Cloud API webhook for hospital booking chatbot.
// GET: verification handshake. POST: incoming messages → state machine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_NAMES = ["السبت","الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس"];
// Map Arabic day → 0..5 (Sat..Thu)
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

function nextDateForDay(targetDow: number): string {
  // targetDow: 0=Sat..5=Thu. JS getDay: 0=Sun..6=Sat. Map: Sat=6,Sun=0,Mon=1,Tue=2,Wed=3,Thu=4
  const jsTarget = [6,0,1,2,3,4][targetDow];
  const today = new Date();
  const diff = (jsTarget - today.getDay() + 7) % 7 || 7; // next occurrence (not today, to be safe)
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d.toISOString().slice(0,10); // YYYY-MM-DD
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
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    })
  });
  if (!res.ok) console.error("WhatsApp send failed:", await res.text());
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: settings } = await supabase.from("app_settings").select("*").eq("id",1).single();
  const verifyToken = settings?.whatsapp_verify_token || "borg_alatiba_verify";
  const token = settings?.whatsapp_token || "";
  const phoneId = settings?.whatsapp_phone_number_id || "";

  // Verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const t = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && t === verifyToken) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json();
    const entry = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg) return new Response("no message", { status: 200 });
    const from: string = msg.from;
    const text: string = normalize(msg.text?.body ?? "");

    // Load session
    const { data: sess } = await supabase.from("chat_sessions").select("*").eq("phone", from).maybeSingle();
    let state: any = sess?.state ?? { step: "idle" };

    const reply = async (m: string) => sendWhatsApp(token, phoneId, from, m);
    const save = async (s: any) => {
      await supabase.from("chat_sessions").upsert({ phone: from, state: s, updated_at: new Date().toISOString() });
    };
    const reset = async () => save({ step: "idle" });

    // Trigger word resets flow
    if (text === "تسجيل" || text === "Registration") {
      const { data: doctors } = await supabase.from("doctors").select("id,name,speciality").order("created_at");
      if (!doctors || doctors.length === 0) {
        await reply("عذراً، لا يوجد أطباء متاحون حالياً.");
        await reset();
        return new Response("ok");
      }
      const list = doctors.map((d, i) => `${i+1}- د. ${d.name} (${d.speciality})`).join("\n");
      await reply(`أهلاً بك في مستشفى برج الأطباء. الرجاء إرسال رقم الطبيب الذي تريد التسجيل لديه:\n\n${list}`);
      await save({ step: "await_doctor", doctors: doctors.map(d => d.id) });
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
        const { data: schedules } = await supabase.from("schedules").select("*").eq("doctor_id", doctorId);
        if (!schedules || schedules.length === 0) {
          await reply("عذراً، لا يوجد جدول عمل لهذا الطبيب حالياً. الرجاء اختيار طبيب آخر بإرسال 'تسجيل'.");
          await reset();
          break;
        }
        const byDay: Record<number,string[]> = {};
        schedules.forEach(s => { (byDay[s.day_of_week] ||= []).push(SHIFT_AR[s.shift]); });
        const lines = Object.keys(byDay).map(k => {
          const d = parseInt(k);
          return `• ${DAY_NAMES[d]} — ${byDay[d].join(" / ")}`;
        }).join("\n");
        await reply(`أيام عمل د. ${doc.name}:\n${lines}\n\nالرجاء إرسال اسم اليوم الذي تريد الحجز فيه.`);
        await save({ step: "await_day", doctor_id: doctorId });
        break;
      }
      case "await_day": {
        const dow = DAY_LOOKUP[text];
        const { data: schedules } = await supabase.from("schedules").select("*").eq("doctor_id", state.doctor_id);
        const sched = schedules?.find(s => s.day_of_week === dow);
        if (dow === undefined || !sched) {
          const days = (schedules||[]).map(s => DAY_NAMES[s.day_of_week]);
          const uniq = [...new Set(days)].join("، ");
          await reply(`عذراً، الرجاء اختيار يوم من الأيام المحددة لعيادة الطبيب:\n${uniq}`);
          break;
        }
        const date = nextDateForDay(dow);
        // Capacity check
        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", state.doctor_id)
          .eq("booking_date", date);
        const used = count ?? 0;
        if (used >= sched.max_capacity) {
          await reply("اكتمل التسجيل في هذا اليوم، الرجاء اختيار يوم آخر.");
          break;
        }
        await reply("يوجد متسع، الرجاء كتابة اسم المريض الرباعي لتأكيد الحجز.");
        await save({
          step: "await_name",
          doctor_id: state.doctor_id,
          day_of_week: dow,
          date,
          shift: sched.shift,
        });
        break;
      }
      case "await_name": {
        if (text.length < 5) {
          await reply("الرجاء إدخال الاسم الرباعي كاملاً.");
          break;
        }
        const { error } = await supabase.from("bookings").insert({
          doctor_id: state.doctor_id,
          patient_name: text,
          patient_phone: from,
          booking_date: state.date,
          day_of_week: state.day_of_week,
          shift: state.shift,
          source: "whatsapp",
        });
        if (error) {
          console.error(error);
          await reply("حدث خطأ أثناء حفظ الحجز. الرجاء المحاولة لاحقاً.");
          await reset();
          break;
        }
        await reply(`تم تأكيد الحجز بنجاح. موعدك هو ( ${DAY_NAMES[state.day_of_week]} ) ( ${state.date} ) ، نتمنى لكم دوام الصحة والعافية.`);
        await reset();
        break;
      }
      default:
        await reply("للتسجيل في مستشفى برج الأطباء، الرجاء إرسال كلمة: تسجيل");
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("error", { status: 200 }); // 200 to prevent retries
  }
});