
-- App settings (single-row config: admin credentials + WhatsApp API)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  admin_username TEXT NOT NULL DEFAULT '123',
  admin_password TEXT NOT NULL DEFAULT '123',
  whatsapp_token TEXT DEFAULT '',
  whatsapp_phone_number_id TEXT DEFAULT '',
  whatsapp_verify_token TEXT DEFAULT 'borg_alatiba_verify',
  notify_phone TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1);

-- Doctors
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  speciality TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schedules: one row per (doctor, day, shift) with capacity
-- day_of_week: 0=Sat,1=Sun,2=Mon,3=Tue,4=Wed,5=Thu (Friday excluded)
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  shift TEXT NOT NULL CHECK (shift IN ('morning','evening')),
  max_capacity INT NOT NULL DEFAULT 20 CHECK (max_capacity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, day_of_week, shift)
);

-- Bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  booking_date DATE NOT NULL,
  day_of_week INT NOT NULL,
  shift TEXT,
  source TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bookings_doctor_date_idx ON public.bookings(doctor_id, booking_date);

-- WhatsApp chat session state machine
CREATE TABLE public.chat_sessions (
  phone TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS; permissive policies (internal tool — UI gates by role; server-side admin actions go via edge function with service role)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can read everything (internal staff dashboard); writes go through edge functions using service role
CREATE POLICY "read_all_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "read_all_doctors" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "read_all_schedules" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "read_all_bookings" ON public.bookings FOR SELECT USING (true);
-- chat_sessions intentionally has NO policies (no anon access; only service role used by webhook)
