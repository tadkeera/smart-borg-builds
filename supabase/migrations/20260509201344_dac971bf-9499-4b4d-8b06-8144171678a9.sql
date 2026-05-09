DROP POLICY IF EXISTS "read_all_settings" ON public.app_settings;
DROP POLICY IF EXISTS "read_all_bookings" ON public.bookings;

-- Explicit deny-by-default policy on chat_sessions to satisfy linter and document intent
CREATE POLICY "deny_all_chat_sessions" ON public.chat_sessions FOR SELECT USING (false);