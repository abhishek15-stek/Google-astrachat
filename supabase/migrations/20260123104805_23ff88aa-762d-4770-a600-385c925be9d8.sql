-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Create storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies for chat attachments
CREATE POLICY "Users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view all chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for avatars
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add file_url and file_type columns to messages for attachments
ALTER TABLE public.messages ADD COLUMN file_url TEXT;
ALTER TABLE public.messages ADD COLUMN file_type TEXT;

-- Enable DELETE for messages (admins only for now)
CREATE POLICY "Admins can delete messages"
ON public.messages FOR DELETE
USING (is_admin());

-- Add UPDATE policy for profiles is_banned
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (is_admin());

-- Make sure the group_members policies are correct
DROP POLICY IF EXISTS "Only admins can manage group members" ON public.group_members;

CREATE POLICY "Admins can insert group members"
ON public.group_members FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can delete group members"
ON public.group_members FOR DELETE
USING (is_admin());