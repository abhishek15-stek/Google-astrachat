import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Message {
  id: string;
  sender_id: string;
  receiver_type: 'admin' | 'group' | 'ai';
  receiver_id: string;
  content: string;
  created_at: string;
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
  const { user, isAdmin } = useAuth();
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

  // Fetch all chat threads
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

      // Always add admin support chat for non-admin users (private 1-on-1)
      if (!isAdmin) {
        const adminId = await getAdminId();
        if (adminId) {
          // Get last message in this user's private admin chat
          const { data: adminMsgs } = await supabase
            .from('messages')
            .select('*')
            .eq('receiver_type', 'admin')
            .eq('receiver_id', user.id) // Private chat uses user's own ID as receiver
            .order('created_at', { ascending: false })
            .limit(1);

          const lastAdminMsg = adminMsgs?.[0] ? {
            ...adminMsgs[0],
            receiver_type: adminMsgs[0].receiver_type as 'admin' | 'group',
          } : undefined;

          threadList.push({
            id: user.id, // Use user's own ID for private admin chat
            type: 'admin',
            name: 'Admin Support',
            lastMessage: lastAdminMsg,
            unreadCount: 0,
            isAdmin: true,
          });
        }
      }

      // Get groups
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name, is_broadcast)')
        .eq('user_id', user.id);

      if (memberships) {
        for (const membership of memberships) {
          const group = membership.groups as unknown as { id: string; name: string; is_broadcast: boolean };
          if (group) {
            // Get last message for this group
            const { data: groupMsgs } = await supabase
              .from('messages')
              .select('*')
              .eq('receiver_type', 'group')
              .eq('receiver_id', group.id)
              .order('created_at', { ascending: false })
              .limit(1);

            const lastGroupMsg = groupMsgs?.[0] ? {
              ...groupMsgs[0],
              receiver_type: groupMsgs[0].receiver_type as 'admin' | 'group',
            } : undefined;

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

      // For admin: show ALL users for direct messaging (not just those who messaged)
      if (isAdmin) {
        // Get all non-admin users
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, display_name, email');

        // Get admin role users to filter them out
        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

        if (allProfiles) {
          for (const profile of allProfiles) {
            // Skip admin users and current user
            if (adminUserIds.has(profile.id) || profile.id === user.id) continue;

            // Get last message for this user's private chat
            const { data: userMsgs } = await supabase
              .from('messages')
              .select('*')
              .eq('receiver_type', 'admin')
              .eq('receiver_id', profile.id)
              .order('created_at', { ascending: false })
              .limit(1);

            const lastUserMsg = userMsgs?.[0] ? {
              ...userMsgs[0],
              receiver_type: userMsgs[0].receiver_type as 'admin' | 'group',
            } : undefined;

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
  }, [user, isAdmin, getAdminId]);

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
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [user, activeThread]);

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          // Get sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, email')
            .eq('id', newMsg.sender_id)
            .maybeSingle();

          const messageWithSender: Message = {
            ...newMsg,
            receiver_type: newMsg.receiver_type as 'admin' | 'group',
            sender: profile || undefined,
          };

          // Add to messages if in active thread
          if (activeThread) {
            const isRelevant = 
              (activeThread.type === 'group' && 
               newMsg.receiver_type === 'group' && 
               newMsg.receiver_id === activeThread.id) ||
              (activeThread.type === 'admin' && 
               newMsg.receiver_type === 'admin' && 
               newMsg.receiver_id === activeThread.id);

            if (isRelevant) {
              setMessages(prev => [...prev, messageWithSender]);
            }
          }

          // Refresh threads to update last message
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeThread, fetchThreads]);

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