-- Add permissions column to user_roles table
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "index": true,
  "doctors": true,
  "schedules": true,
  "whatsapp": true,
  "reports": true,
  "audit": true,
  "account": true
}'::jsonb;

-- Update existing admins to have all permissions (though they usually bypass check)
UPDATE public.user_roles SET permissions = '{
  "index": true,
  "doctors": true,
  "schedules": true,
  "whatsapp": true,
  "reports": true,
  "audit": true,
  "account": true
}'::jsonb WHERE role = 'admin';
