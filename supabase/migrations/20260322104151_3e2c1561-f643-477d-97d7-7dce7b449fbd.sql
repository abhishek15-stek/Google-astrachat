-- Add new role values to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'senior_member';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'member';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'spectator';