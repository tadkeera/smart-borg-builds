ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS queue_number integer;
CREATE INDEX IF NOT EXISTS idx_bookings_doctor_date_shift ON public.bookings(doctor_id, booking_date, shift);
CREATE INDEX IF NOT EXISTS idx_bookings_phone_doctor ON public.bookings(patient_phone, doctor_id);