// WhatsApp Cloud API webhook for hospital booking chatbot — multi-instance.
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
const MAX_PER_PHONE_PER_DOCTOR = 2;

function normalize(s: string) {
  return s.trim().replace(/[ـ]/g,"").replace(/\s+/g," ");
}

function startOfWeekSaturday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0,0,0,0);
  const back = (out.getDay() + 1) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

function activeWeekStart(now: Date): Date {
  const base = startOfWeekSaturday(now);
  const cutoff = new Date(base);
  cutoff.setDate(base.getDate() + 5);
  cutoff.setHours(22, 0, 0, 0);
  if (now >= cutoff) base.setDate(base.getDate() + 7);
  return base;
}

function ymd(d: Date) { return d.toISOString().slice(0,10); }

function weekDates(weekOffset: number): { dow: number; date: string }[] {
  const start = activeWeekStart(new Date());
  start.setDate(start.getDate() + weekOffset * 7);
  const out: { dow: number; date: string }[] = [];
  for (let i = 0; i < 6; i++) {
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

// Build a circled-bold queue number for the confirmation message.
// Uses Unicode bold digits + parenthesis-style framing for a "in a circle" feel
// across phones that don't render combining circle glyphs reliably.
function formatQueueNumber(n: number): string {
  const boldDigits = ["𝟬","𝟭","𝟮","𝟯","𝟰","𝟱","𝟲","𝟳","𝟴","𝟵"];
  const bold = String(n).split("").map(d => boldDigits[parseInt(d,10)] ?? d).join("");
  return `⟪ ${bold} ⟫`;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

    const { data: instance } = await supabase.from("whatsapp_instances")
      .select("*").eq("phone_number_id", incomingPhoneId).maybeSingle();
    if (!instance || !instance.is_active) return new Response("no instance", { status: 200 });
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
        .select("id,name,speciality,allow_next_week,allow_two_weeks,is_paused")
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

        // Anti-spam: max bookings per phone per doctor — only if enabled for this doctor
        if (doc.has_booking_limit !== false) {
          const { count: phoneCount } = await supabase.from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", doctorId)
            .eq("patient_phone", from)
            .neq("status", "cancelled");
          if ((phoneCount ?? 0) >= MAX_PER_PHONE_PER_DOCTOR) {
            await reply(`عذراً، تم الوصول للحد الأقصى من الحجوزات لهذا الطبيب من نفس الرقم (${MAX_PER_PHONE_PER_DOCTOR} مرضى كحد أقصى).`);
            await reset(); break;
          }
        }

        const { data: schedules } = await supabase.from("schedules")
          .select("*").eq("doctor_id", doctorId).eq("is_paused", false);
        if (!schedules || schedules.length === 0) {
          await reply("عذراً، لا يوجد جدول عمل لهذا الطبيب حالياً. أرسل 'تسجيل'.");
          await reset(); break;
        }

        const weeksToCheck: number[] = doc.allow_two_weeks ? [0,1,2] : (doc.allow_next_week ? [0,1] : [0]);
        const todayStr = ymd(new Date());
        const offered: { dow: number; date: string; shifts: string[] }[] = [];
        for (const w of weeksToCheck) {
          for (const { dow, date } of weekDates(w)) {
            if (date < todayStr) continue;
            const matching = schedules.filter(s => s.day_of_week === dow);
            if (matching.length === 0) continue;
            offered.push({ dow, date, shifts: matching.map(s => s.shift) });
          }
        }

        if (offered.length === 0) {
          await reply("لا توجد مواعيد متاحة حالياً.");
          await reset(); break;
        }

        const lines = offered.map((o, i) =>
          `${i+1}- ${DAY_NAMES[o.dow]} ${o.date} — ${o.shifts.map(s => SHIFT_AR[s]).join(" / ")}`
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
          const dow = DAY_LOOKUP[text];
          if (dow !== undefined) pick = (state.offered ?? []).find((o: any) => o.dow === dow) ?? null;
        }
        if (!pick) {
          await reply("الرجاء إرسال رقم من القائمة.");
          break;
        }

        // If multiple shifts on same day → ask user to choose
        if (pick.shifts.length > 1) {
          await reply("الطبيب متاح في فترتين، يرجى اختيار الفترة:\n1- صباحية\n2- مسائية");
          await save({
            step: "await_shift",
            doctor_id: state.doctor_id,
            day_of_week: pick.dow,
            date: pick.date,
            shifts: pick.shifts,
            instance_id: state.instance_id,
          });
          break;
        }

        const chosenShift = pick.shifts[0];
        const proceed = await prepareBooking(supabase, reply, save, state, pick.dow, pick.date, chosenShift);
        if (!proceed) break;
        break;
      }
      case "await_shift": {
        let chosen: string | null = null;
        const n = parseInt(text, 10);
        if (n === 1) chosen = "morning";
        else if (n === 2) chosen = "evening";
        else if (text.includes("صباح")) chosen = "morning";
        else if (text.includes("مساء") || text.includes("مسائ")) chosen = "evening";
        if (!chosen || !(state.shifts ?? []).includes(chosen)) {
          await reply("الرجاء اختيار: 1 للصباحية أو 2 للمسائية.");
          break;
        }
        await prepareBooking(supabase, reply, save, state, state.day_of_week, state.date, chosen);
        break;
      }
      case "await_name": {
        if (text.length < 5) { await reply("الرجاء إدخال الاسم الرباعي كاملاً."); break; }

        // Duplicate name check (same doctor + date)
        const { data: dup } = await supabase.from("bookings")
          .select("id")
          .eq("doctor_id", state.doctor_id)
          .eq("booking_date", state.date)
          .eq("patient_name", text)
          .neq("status", "cancelled")
          .limit(1).maybeSingle();
        if (dup) {
          await reply("هذا الاسم مسجل مسبقاً، يرجى كتابة الاسم الثلاثي أو إضافة اللقب لتمييز المريض.");
          break;
        }

        // Re-check capacity & compute queue number
        const { data: sched } = await supabase.from("schedules")
          .select("*").eq("doctor_id", state.doctor_id)
          .eq("day_of_week", state.day_of_week)
          .eq("shift", state.shift)
          .eq("is_paused", false).limit(1).maybeSingle();
        if (!sched) { await reply("لم يعد هذا الموعد متاحاً."); await reset(); break; }

        const { count } = await supabase.from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", state.doctor_id)
          .eq("booking_date", state.date)
          .eq("shift", state.shift)
          .neq("status", "cancelled");
        const used = count ?? 0;
        if (used >= sched.max_capacity) {
          await reply("اكتمل التسجيل في هذا الموعد، الرجاء اختيار موعد آخر.");
          await reset(); break;
        }
        const queueNumber = used + 1;

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
          queue_number: queueNumber,
        });
        if (error) {
          console.error(error);
          await reply("حدث خطأ أثناء حفظ الحجز. الرجاء المحاولة لاحقاً.");
          await reset(); break;
        }
        await reply(
`تم تأكيد الحجز بنجاح.
الاسم: ${text}
موعدك هو ${DAY_NAMES[state.day_of_week]} الموافق ${state.date}
الفترة: ${SHIFT_AR[state.shift] ?? state.shift}
رقمك هو ${formatQueueNumber(queueNumber)}
نتمنى لكم دوام الصحة والعافية.`
        );
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

// Validates capacity and either prompts for name or rejects.
async function prepareBooking(
  supabase: any,
  reply: (m: string) => Promise<void>,
  save: (s: any) => Promise<void>,
  state: any,
  dow: number,
  date: string,
  shift: string,
): Promise<boolean> {
  const { data: sched } = await supabase.from("schedules")
    .select("*")
    .eq("doctor_id", state.doctor_id)
    .eq("day_of_week", dow)
    .eq("shift", shift)
    .eq("is_paused", false)
    .limit(1).maybeSingle();
  if (!sched) { await reply("لم يعد هذا الموعد متاحاً."); return false; }

  const { count } = await supabase.from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("doctor_id", state.doctor_id)
    .eq("booking_date", date)
    .eq("shift", shift)
    .neq("status", "cancelled");
  if ((count ?? 0) >= sched.max_capacity) {
    await reply("اكتمل التسجيل في هذا الموعد (الفترة ممتلئة)، الرجاء اختيار موعد آخر.");
    return false;
  }
  await reply("يوجد متسع، الرجاء كتابة اسم المريض الرباعي لتأكيد الحجز.");
  await save({
    step: "await_name",
    doctor_id: state.doctor_id,
    day_of_week: dow,
    date,
    shift,
    instance_id: state.instance_id,
  });
  return true;
}
