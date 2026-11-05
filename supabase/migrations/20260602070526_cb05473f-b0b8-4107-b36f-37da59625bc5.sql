
-- AI Credits daily bucket
CREATE TABLE public.ai_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bucket_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  text_used int NOT NULL DEFAULT 0,
  image_used int NOT NULL DEFAULT 0,
  video_used int NOT NULL DEFAULT 0,
  file_used int NOT NULL DEFAULT 0,
  advanced_used int NOT NULL DEFAULT 0,
  admin_notify_counter int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, bucket_date)
);

GRANT SELECT ON public.ai_credits TO authenticated;
GRANT ALL ON public.ai_credits TO service_role;
ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credits" ON public.ai_credits FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin() OR has_role_level(auth.uid(), 'sub_admin'::app_role));

-- AI usage log
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model text NOT NULL,
  kind text NOT NULL,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  duration_ms int DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON public.ai_usage_log FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin() OR has_role_level(auth.uid(), 'sub_admin'::app_role));

CREATE INDEX ai_usage_log_user_date ON public.ai_usage_log (user_id, created_at DESC);
CREATE INDEX ai_usage_log_created_at ON public.ai_usage_log (created_at DESC);

-- Credit consumption function. Returns json: {allowed, remaining, kind, role, admin_notice}
CREATE OR REPLACE FUNCTION public.check_and_consume_credit(_user_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _is_batch boolean;
  _is_admin boolean;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _row public.ai_credits%ROWTYPE;
  _limit int;
  _used int;
  _col text;
  _notice boolean := false;
BEGIN
  SELECT role INTO _role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
  IF _role IS NULL THEN _role := 'user'; END IF;
  _is_admin := (_role = 'admin');
  _is_batch := role_level(_role) >= role_level('member'::app_role);

  -- Map kind to column + limit
  CASE _kind
    WHEN 'text'     THEN _col := 'text_used';     _limit := CASE WHEN _is_admin THEN 999999 WHEN _is_batch THEN 100 ELSE 20 END;
    WHEN 'image'    THEN _col := 'image_used';    _limit := CASE WHEN _is_admin THEN 999999 WHEN _is_batch THEN 10  ELSE 3  END;
    WHEN 'video'    THEN _col := 'video_used';    _limit := CASE WHEN _is_admin THEN 999999 WHEN _is_batch THEN 10  ELSE 3  END;
    WHEN 'file'     THEN _col := 'file_used';     _limit := CASE WHEN _is_admin THEN 999999 WHEN _is_batch THEN 10  ELSE 3  END;
    WHEN 'advanced' THEN _col := 'advanced_used'; _limit := CASE WHEN _is_admin THEN 999999 WHEN _is_batch THEN 5   ELSE 1  END;
    ELSE RETURN jsonb_build_object('allowed', false, 'error', 'unknown_kind');
  END CASE;

  -- Upsert row
  INSERT INTO public.ai_credits (user_id, bucket_date)
  VALUES (_user_id, _today)
  ON CONFLICT (user_id, bucket_date) DO NOTHING;

  -- Lock current row
  SELECT * INTO _row FROM public.ai_credits WHERE user_id = _user_id AND bucket_date = _today FOR UPDATE;

  EXECUTE format('SELECT %I FROM public.ai_credits WHERE id = $1', _col) INTO _used USING _row.id;

  IF NOT _is_admin AND _used >= _limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'credit_exhausted',
      'kind', _kind,
      'used', _used,
      'limit', _limit,
      'resets_at', (_today + 1)::timestamp,
      'role', _role
    );
  END IF;

  -- Increment
  EXECUTE format('UPDATE public.ai_credits SET %I = %I + 1, updated_at = now(), admin_notify_counter = CASE WHEN $2 THEN admin_notify_counter + 1 ELSE admin_notify_counter END WHERE id = $1 RETURNING %I, admin_notify_counter', _col, _col, _col)
    INTO _used, _row.admin_notify_counter
    USING _row.id, _is_admin;

  IF _is_admin AND _row.admin_notify_counter > 0 AND (_row.admin_notify_counter % 5) = 0 THEN
    _notice := true;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'kind', _kind,
    'used', _used,
    'limit', _limit,
    'remaining', GREATEST(_limit - _used, 0),
    'role', _role,
    'is_admin', _is_admin,
    'admin_notice', _notice,
    'admin_counter', _row.admin_notify_counter
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_consume_credit(uuid, text) TO authenticated, service_role;
