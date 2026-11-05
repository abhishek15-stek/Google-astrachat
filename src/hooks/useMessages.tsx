import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Message {
  id: string;
  sender_id: string;
  receiver_type: 'admin' | 'group' | 'ai';
  receiver_id: string;
  content: string;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
  sender?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}

export interface ChatThread {
  id: string;
  type: 'admin' | 'group' | 'ai';
  name: string;
  lastMessage?: Message;
  unreadCount: number;
  isAdmin?: boolean;
  isBroadcast?: boolean;
  isAI?: boolean;
}

export function useMessages() {
  const { user, isAdmin, roleLevel } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);

  // Get admin ID for private chats
  const getAdminId = useCallback(async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    return data?.user_id;
  }, []);

  // Fetch all chat threads without N+1 query loops
  const fetchThreads = useCallback(async () => {
    if (!user) return;

    try {
      const threadList: ChatThread[] = [];

      // Always add AstraBot AI as first thread for all users
      threadList.push({
        id: 'ai-assistant',
        type: 'ai',
        name: 'AstraBot AI',
        unreadCount: 0,
        isAI: true,
      });

      // 1) Batch fetch recent messages in a single query to eliminate N+1 loops
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      const lastMessageMap = new Map<string, Message>();
      if (recentMsgs) {
        for (const msg of recentMsgs) {
          if (!lastMessageMap.has(msg.receiver_id)) {
            lastMessageMap.set(msg.receiver_id, msg as unknown as Message);
          }
        }
      }

      // Always add admin support chat for non-admin users (private 1-on-1)
      if (!isAdmin) {
        const lastAdminMsg = lastMessageMap.get(user.id);
        threadList.push({
          id: user.id, // Use user's own ID for private admin chat
          type: 'admin',
          name: 'Admin Support',
          lastMessage: lastAdminMsg,
          unreadCount: 0,
          isAdmin: true,
        });
      }

      // Senior roles can see all groups; normal users only see groups they belong to.
      if (roleLevel >= 60) {
        const { data: groupsData } = await supabase
          .from('groups')
          .select('id, name, is_broadcast')
          .order('created_at', { ascending: false });

        for (const group of groupsData || []) {
          if (group) {
            const lastGroupMsg = lastMessageMap.get(group.id);
            threadList.push({
              id: group.id,
              type: 'group',
              name: group.name,
              lastMessage: lastGroupMsg,
              unreadCount: 0,
              isBroadcast: group.is_broadcast,
            });
          }
        }
      } else {
        const { data: memberships } = await supabase
          .from('group_members')
          .select('group_id, groups(id, name, is_broadcast)')
          .eq('user_id', user.id);

        if (memberships) {
          for (const membership of memberships) {
            const group = membership.groups as unknown as { id: string; name: string; is_broadcast: boolean };
            if (group) {
              const lastGroupMsg = lastMessageMap.get(group.id);
              threadList.push({
                id: group.id,
                type: 'group',
                name: group.name,
                lastMessage: lastGroupMsg,
                unreadCount: 0,
                isBroadcast: group.is_broadcast,
              });
            }
          }
        }
      }

      // Member+ badges can inspect all user support chats; admins/sub-admins keep full visibility.
      if (roleLevel >= 40) {
        // Parallel fetch profiles and admin roles
        const [{ data: allProfiles }, { data: adminRoles }] = await Promise.all([
          supabase.from('profiles').select('id, display_name, email'),
          supabase.from('user_roles').select('user_id').eq('role', 'admin'),
        ]);

        const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

        if (allProfiles) {
          for (const profile of allProfiles) {
            // Skip admin users and current user
            if (adminUserIds.has(profile.id) || profile.id === user.id) continue;

            const lastUserMsg = lastMessageMap.get(profile.id);
            threadList.push({
              id: profile.id,
              type: 'admin',
              name: profile.display_name || profile.email,
              lastMessage: lastUserMsg,
              unreadCount: 0,
            });
          }
        }
      }

      // Sort by last message time, but keep AI and Admin Support at top for users
      threadList.sort((a, b) => {
        if (a.isAI) return -1;
        if (b.isAI) return 1;
        if (a.isAdmin) return -1;
        if (b.isAdmin) return 1;
        const aTime = a.lastMessage?.created_at || '';
        const bTime = b.lastMessage?.created_at || '';
        return bTime.localeCompare(aTime);
      });

      setThreads(threadList);
    } catch (error) {
      console.error('Error fetching threads:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, roleLevel]);

  // Fetch messages for active thread
  const fetchMessages = useCallback(async () => {
    if (!user || !activeThread) return;

    // Skip database query for AI threads - AI conversations are stored separately
    if (activeThread.type === 'ai') {
      setMessages([]);
      return;
    }

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (activeThread.type === 'group') {
        query = query
          .eq('receiver_type', 'group')
          .eq('receiver_id', activeThread.id);
      } else {
        // Admin private chat - receiver_id is the user's ID
        query = query
          .eq('receiver_type', 'admin')
          .eq('receiver_id', activeThread.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      // Get sender profiles
      if (data && data.length > 0) {
        const senderIds = [...new Set(data.map(m => m.sender_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', senderIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        
        const messagesWithSenders = data.map(msg => ({
          ...msg,
          receiver_type: msg.receiver_type as 'admin' | 'group',
          sender: profileMap.get(msg.sender_id),
        }));

        setMessages(messagesWithSenders);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [user, activeThread]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!user || !activeThread || !content.trim()) return;

    // AI threads don't use the messages table - handled by AIChatThread component
    if (activeThread.type === 'ai') {
      console.log('AI messages are handled separately');
      return;
    }

    try {
      // For admin chat: receiver_id is the user's ID (the thread.id)
      // For group chat: receiver_id is the group's ID
      const receiverId = activeThread.id;

      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_type: activeThread.type,
          receiver_id: receiverId,
          content: content.trim(),
        });

      if (error) {
        console.error('Error sending message:', error);
        throw error;
      }

      const issueText = content.trim();
      if (/\b(error|bug|problem|issue|not working|broken|crash|failed|fail|blank screen|permission|cannot|can't|unable|video call|voice call|screen share|upload|download|login)\b/i.test(issueText)) {
        const category = /screen|permission|record/i.test(issueText) ? 'screen_share'
          : /video|voice|call|mic|camera/i.test(issueText) ? 'calling'
          : /photo|image|media|file|upload|download/i.test(issueText) ? 'media'
          : /login|auth|password|sign/i.test(issueText) ? 'login'
          : 'bug';
        const { data: profile } = await supabase.from('profiles').select('display_name, email').eq('id', user.id).maybeSingle();
        await supabase.from('user_reported_issues').insert({
          user_id: user.id,
          user_name: profile?.display_name || null,
          user_email: profile?.email || null,
          category,
          main_problem: issueText.replace(/\s+/g, ' ').slice(0, 120),
          detailed_explanation: `Auto-detected from ${activeThread.type} chat: ${issueText}`,
          user_feedback: issueText,
          priority: /crash|blank|failed|cannot|can't|permission|call/i.test(issueText) ? 'high' : 'medium',
          status: 'open',
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [user, activeThread]);

  // Use a ref to track activeThread inside realtime callback (avoid stale closure)
  const activeThreadRef = useRef(activeThread);
  useEffect(() => {
    activeThreadRef.current = activeThread;
  }, [activeThread]);

  // Use refs to avoid reconnection loops on every state change
  const fetchThreadsRef = useRef(fetchThreads);
  useEffect(() => {
    fetchThreadsRef.current = fetchThreads;
  }, [fetchThreads]);

  const profileCache = useRef<Map<string, { id: string; display_name: string | null; email: string }>>(new Map());

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channelName = `messages-realtime-${user.id}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          // Check profile cache before querying database
          let profile = profileCache.current.get(newMsg.sender_id);
          if (!profile) {
            const { data } = await supabase
              .from('profiles')
              .select('id, display_name, email')
              .eq('id', newMsg.sender_id)
              .maybeSingle();

            if (data) {
              profile = data;
              profileCache.current.set(newMsg.sender_id, data);
            }
          }

          const messageWithSender: Message = {
            ...newMsg,
            receiver_type: newMsg.receiver_type as 'admin' | 'group' | 'ai',
            sender: profile || undefined,
          };

          // Use ref to get current activeThread (not stale closure)
          const currentThread = activeThreadRef.current;

          setMessages(prev => {
            if (!currentThread) return prev;
            
            const isRelevant = 
              (currentThread.type === 'group' && 
               newMsg.receiver_type === 'group' && 
               newMsg.receiver_id === currentThread.id) ||
              (currentThread.type === 'admin' && 
               newMsg.receiver_type === 'admin' && 
               newMsg.receiver_id === currentThread.id);

            if (isRelevant) {
              if (prev.some(m => m.id === messageWithSender.id)) {
                return prev;
              }
              return [...prev, messageWithSender];
            }
            return prev;
          });

          // Refresh threads without triggering channel recreation
          fetchThreadsRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch threads on mount
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Fetch messages when active thread changes
  useEffect(() => {
    if (activeThread) {
      fetchMessages();
    }
  }, [activeThread, fetchMessages]);

  return {
    messages,
    threads,
    loading,
    activeThread,
    setActiveThread,
    sendMessage,
    refreshThreads: fetchThreads,
  };
}