
-- 1) Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'receptionist');

-- 2) user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4) RLS for user_roles: users see their own roles, admins manage all
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Trigger: first ever signed-up user becomes admin
CREATE OR REPLACE FUNCTION public.assign_first_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_assign_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_first_admin();

-- 6) Replace deny-all RLS on data tables
DROP POLICY IF EXISTS deny_all_bookings ON public.bookings;
DROP POLICY IF EXISTS deny_all_app_settings ON public.app_settings;
DROP POLICY IF EXISTS deny_all_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS read_all_doctors ON public.doctors;
DROP POLICY IF EXISTS read_all_schedules ON public.schedules;

-- bookings: admin full, receptionist read-only
CREATE POLICY "bookings admin all" ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bookings receptionist read" ON public.bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'receptionist'));

-- doctors: any authenticated read; admin write
CREATE POLICY "doctors read" ON public.doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "doctors admin write" ON public.doctors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- schedules: any authenticated read; admin write
CREATE POLICY "schedules read" ON public.schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules admin write" ON public.schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- app_settings: admin only (read + write)
CREATE POLICY "settings admin all" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- chat_sessions: locked (service role only via edge functions)
-- no policies = no access for anon/authenticated
