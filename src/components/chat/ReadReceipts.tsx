import React, { useEffect, useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReadReceiptsProps {
  messageId: string;
  senderId: string;
  threadId: string;
  threadType: 'admin' | 'group' | 'ai';
}

// Module-level cache for group member counts to prevent redundant queries
const groupRecipientsCache = new Map<string, number>();

// Module-level set of message IDs already marked as read in this session
const markedReadIds = new Set<string>();

export function ReadReceipts({ messageId, senderId, threadId, threadType }: ReadReceiptsProps) {
  const { user } = useAuth();
  const [readBy, setReadBy] = useState<string[]>([]);
  const [totalRecipients, setTotalRecipients] = useState(0);

  // Only show read receipts for messages sent by current user
  const isOwnMessage = senderId === user?.id;

  useEffect(() => {
    if (!isOwnMessage) return;

    let isMounted = true;

    const fetchReadReceipts = async () => {
      try {
        const { data: receipts } = await supabase
          .from('read_receipts')
          .select('user_id')
          .eq('message_id', messageId);

        if (receipts && isMounted) {
          setReadBy(receipts.map(r => r.user_id));
        }

        // Use cached recipient count if available
        if (threadType === 'group') {
          if (groupRecipientsCache.has(threadId)) {
            if (isMounted) setTotalRecipients(groupRecipientsCache.get(threadId)!);
          } else {
            const { data: members } = await supabase
              .from('group_members')
              .select('user_id')
              .eq('group_id', threadId)
              .neq('user_id', user?.id);

            const count = members?.length || 0;
            groupRecipientsCache.set(threadId, count);
            if (isMounted) setTotalRecipients(count);
          }
        } else {
          if (isMounted) setTotalRecipients(1); // Admin chat is 1-on-1
        }
      } catch (err) {
        console.warn('Failed to fetch read receipts:', err);
      }
    };

    fetchReadReceipts();

    // Subscribe to realtime changes only for this active message
    const channelName = `receipts-${messageId}`;
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
          table: 'read_receipts',
          filter: `message_id=eq.${messageId}`,
        },
        (payload) => {
          if (isMounted) {
            setReadBy(prev => prev.includes(payload.new.user_id) ? prev : [...prev, payload.new.user_id]);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [messageId, isOwnMessage, threadId, threadType, user?.id]);

  if (!isOwnMessage) return null;

  const isDelivered = true; // Messages are always delivered when saved
  const isRead = readBy.length > 0;
  const allRead = readBy.length >= totalRecipients && totalRecipients > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex ml-1">
            {allRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
            ) : isRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
            ) : isDelivered ? (
              <Check className="h-3.5 w-3.5 text-muted-foreground" />
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {allRead ? (
            <p>Read by all ({readBy.length})</p>
          ) : isRead ? (
            <p>Read by {readBy.length} of {totalRecipients}</p>
          ) : (
            <p>Delivered</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hook to mark messages as read with session-level deduplication
export function useMarkAsRead(_threadId: string, _threadType: 'admin' | 'group' | 'ai') {
  const { user } = useAuth();

  const markAsRead = React.useCallback(async (messageIds: string[]) => {
    if (!user || messageIds.length === 0) return;

    // Filter out message IDs that were already processed in this browser session
    const unreadCandidates = messageIds.filter(id => !markedReadIds.has(id));
    if (unreadCandidates.length === 0) return;

    // Mark in memory immediately to prevent concurrent duplicate calls
    unreadCandidates.forEach(id => markedReadIds.add(id));

    try {
      // Check database to ensure we don't duplicate existing read receipts
      const { data: existingReceipts } = await supabase
        .from('read_receipts')
        .select('message_id')
        .eq('user_id', user.id)
        .in('message_id', unreadCandidates);

      const existingIds = new Set(existingReceipts?.map(r => r.message_id) || []);
      const newMessageIds = unreadCandidates.filter(id => !existingIds.has(id));

      if (newMessageIds.length > 0) {
        await supabase.from('read_receipts').insert(
          newMessageIds.map(messageId => ({
            message_id: messageId,
            user_id: user.id,
          }))
        );
      }
    } catch (err) {
      console.warn('Error marking messages as read:', err);
    }
  }, [user]);

  return { markAsRead };
}
