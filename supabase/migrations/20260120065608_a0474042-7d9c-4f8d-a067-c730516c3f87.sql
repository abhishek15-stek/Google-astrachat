-- Add is_broadcast flag to groups (only admin can post)
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_broadcast boolean NOT NULL DEFAULT false;

-- Mark Astrachat as broadcast group
UPDATE public.groups SET is_broadcast = true WHERE name = 'Astrachat';

-- Update handle_new_user to auto-add to AstraChat group
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  astrachat_group_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );
  
  -- Assign default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  -- Auto-add to AstraChat broadcast group
  SELECT id INTO astrachat_group_id FROM public.groups WHERE name = 'Astrachat' LIMIT 1;
  IF astrachat_group_id IS NOT NULL THEN
    INSERT INTO public.group_members (group_id, user_id)
    VALUES (astrachat_group_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update messages RLS to support private admin chats
-- Messages to admin type now use receiver_id as the user's id (not admin id) for private routing
DROP POLICY IF EXISTS "Users can send messages to admin or their groups" ON public.messages;
CREATE POLICY "Users can send messages to admin or their groups" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  (sender_id = auth.uid()) AND (
    (receiver_type = 'admin') OR 
    ((receiver_type = 'group') AND is_group_member(auth.uid(), receiver_id) AND (
      -- For broadcast groups, only admin can send
      NOT EXISTS (SELECT 1 FROM groups WHERE id = receiver_id AND is_broadcast = true) OR is_admin()
    ))
  )
);

DROP POLICY IF EXISTS "Users can view messages in their groups" ON public.messages;
CREATE POLICY "Users can view messages in their groups" 
ON public.messages 
FOR SELECT 
USING (
  is_admin() OR 
  ((receiver_type = 'group') AND is_group_member(auth.uid(), receiver_id)) OR 
  ((receiver_type = 'admin') AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
);