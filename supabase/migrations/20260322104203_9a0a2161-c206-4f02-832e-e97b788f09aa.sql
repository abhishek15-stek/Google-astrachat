-- Create helper function to check role hierarchy level
CREATE OR REPLACE FUNCTION public.role_level(_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
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

-- Check if user has at least a certain role level
CREATE OR REPLACE FUNCTION public.has_role_level(_user_id uuid, _min_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role_level(role) >= role_level(_min_role)
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;