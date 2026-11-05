import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface TypingUser {
  user_id: string;
  display_name: string;
}

export function useTypingIndicator(threadType: 'admin' | 'group' | 'ai' | null, threadId: string | null) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update typing status
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!user || !threadType || !threadId) return;

    try {
      await supabase
        .from('typing_status')
        .upsert({
          user_id: user.id,
          thread_type: threadType,
          thread_id: threadId,
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,thread_type,thread_id',
        });
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  }, [user, threadType, threadId]);

  // Handle typing with auto-stop
  const handleTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setTyping(true);

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  }, [setTyping]);

  // Stop typing explicitly
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTyping(false);
  }, [setTyping]);

  // Subscribe to typing status changes
  useEffect(() => {
    if (!threadType || !threadId || !user) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase
      .channel(`typing-${threadType}-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_status',
          filter: `thread_type=eq.${threadType}`,
        },
        async (payload) => {
          // Fetch current typing users
          const { data } = await supabase
            .from('typing_status')
            .select('user_id')
            .eq('thread_type', threadType)
            .eq('thread_id', threadId)
            .eq('is_typing', true)
            .neq('user_id', user.id);

          const userIds = (data || []).map((t) => t.user_id);
          const { data: profiles } = userIds.length
            ? await supabase.from('profiles').select('id, display_name, email').in('id', userIds)
            : { data: [] as { id: string; display_name: string | null; email: string }[] };
          const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

          const typingList: TypingUser[] = (data || []).map(t => ({
            user_id: t.user_id,
            display_name: profileMap.get(t.user_id)?.display_name || profileMap.get(t.user_id)?.email || 'Someone',
          }));

          setTypingUsers(typingList);
        }
      )
      .subscribe();

    // Initial fetch
    const fetchTyping = async () => {
      const { data } = await supabase
        .from('typing_status')
        .select('user_id')
        .eq('thread_type', threadType)
        .eq('thread_id', threadId)
        .eq('is_typing', true)
        .neq('user_id', user.id);

      const userIds = (data || []).map((t) => t.user_id);
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('id, display_name, email').in('id', userIds)
        : { data: [] as { id: string; display_name: string | null; email: string }[] };
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const typingList: TypingUser[] = (data || []).map(t => ({
        user_id: t.user_id,
        display_name: profileMap.get(t.user_id)?.display_name || profileMap.get(t.user_id)?.email || 'Someone',
      }));

      setTypingUsers(typingList);
    };

    fetchTyping();

    return () => {
      supabase.removeChannel(channel);
      stopTyping();
    };
  }, [threadType, threadId, user, stopTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    typingUsers,
    handleTyping,
    stopTyping,
  };
}
