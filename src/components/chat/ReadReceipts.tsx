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

export function ReadReceipts({ messageId, senderId, threadId, threadType }: ReadReceiptsProps) {
  const { user } = useAuth();
  const [readBy, setReadBy] = useState<string[]>([]);
  const [totalRecipients, setTotalRecipients] = useState(0);

  // Only show read receipts for messages sent by current user
  const isOwnMessage = senderId === user?.id;

  useEffect(() => {
    if (!isOwnMessage) return;

    const fetchReadReceipts = async () => {
      const { data: receipts } = await supabase
        .from('read_receipts')
        .select('user_id')
        .eq('message_id', messageId);

      if (receipts) {
        setReadBy(receipts.map(r => r.user_id));
      }

      // Get total recipients
      if (threadType === 'group') {
        const { data: members } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', threadId)
          .neq('user_id', user?.id);
        
        setTotalRecipients(members?.length || 0);
      } else {
        setTotalRecipients(1); // Admin chat is 1-on-1
      }
    };

    fetchReadReceipts();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`read-receipts-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'read_receipts',
          filter: `message_id=eq.${messageId}`,
        },
        (payload) => {
          setReadBy(prev => [...prev, payload.new.user_id]);
        }
      )
      .subscribe();

    return () => {
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

// Hook to mark messages as read
export function useMarkAsRead(threadId: string, threadType: 'admin' | 'group' | 'ai') {
  const { user } = useAuth();

  const markAsRead = React.useCallback(async (messageIds: string[]) => {
    if (!user || messageIds.length === 0) return;

    // Filter out messages already marked as read
    const { data: existingReceipts } = await supabase
      .from('read_receipts')
      .select('message_id')
      .eq('user_id', user.id)
      .in('message_id', messageIds);

    const existingIds = new Set(existingReceipts?.map(r => r.message_id) || []);
    const newMessageIds = messageIds.filter(id => !existingIds.has(id));

    if (newMessageIds.length > 0) {
      await supabase.from('read_receipts').insert(
        newMessageIds.map(messageId => ({
          message_id: messageId,
          user_id: user.id,
        }))
      );
    }
  }, [user]);

  return { markAsRead };
}
