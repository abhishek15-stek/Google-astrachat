-- Fix search_path on role_level function
CREATE OR REPLACE FUNCTION public.role_level(_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'admin' THEN 100
    WHEN 'sub_admin' THEN 80
    WHEN 'senior_member' THEN 60
    WHEN 'member' THEN 40
    WHEN 'user' THEN 20
    WHEN 'spectator' THEN 10
    ELSE 0
  END
$$;