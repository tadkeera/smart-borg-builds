CREATE POLICY "deny_all_app_settings" ON public.app_settings FOR SELECT USING (false);
CREATE POLICY "deny_all_bookings" ON public.bookings FOR SELECT USING (false);