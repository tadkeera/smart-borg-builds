
-- Doctors: allow next week + pause
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS allow_next_week boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- Schedules: pause individual day/shift
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- Bookings: status
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';

-- WhatsApp instances (multi-number)
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number_id text NOT NULL,
  access_token text NOT NULL,
  verify_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa instances admin all" ON public.whatsapp_instances;
CREATE POLICY "wa instances admin all" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Optional link from booking to instance
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Enable realtime for bookings
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
