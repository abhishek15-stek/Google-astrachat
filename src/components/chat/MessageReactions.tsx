import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SmilePlus } from 'lucide-react';

const REACTION_EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '😢', '🙏', '🔥'];

interface Reaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onReactionChange: () => void;
}

export function MessageReactions({ messageId, reactions, onReactionChange }: MessageReactionsProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleReaction = async (emoji: string) => {
    if (!user) return;

    const existingReaction = reactions.find(r => r.emoji === emoji && r.hasReacted);

    if (existingReaction) {
      // Remove reaction
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
    } else {
      // Add reaction
      await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
    }

    onReactionChange();
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {reactions.filter(r => r.count > 0).map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => handleReaction(reaction.emoji)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all",
            reaction.hasReacted
              ? "bg-primary/20 border border-primary/40"
              : "bg-muted/50 border border-border/50 hover:bg-muted"
          )}
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <SmilePlus className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" side="top" align="start">
          <div className="flex gap-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Hook to fetch reactions for a message
export function useMessageReactions(messageId: string) {
  const { user } = useAuth();
  const [reactions, setReactions] = React.useState<Reaction[]>([]);

  const fetchReactions = React.useCallback(async () => {
    const { data } = await supabase
      .from('message_reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId);

    if (data) {
      const reactionMap = new Map<string, { count: number; hasReacted: boolean }>();
      
      data.forEach((r) => {
        const existing = reactionMap.get(r.emoji) || { count: 0, hasReacted: false };
        reactionMap.set(r.emoji, {
          count: existing.count + 1,
          hasReacted: existing.hasReacted || r.user_id === user?.id,
        });
      });

      setReactions(
        Array.from(reactionMap.entries()).map(([emoji, data]) => ({
          emoji,
          ...data,
        }))
      );
    }
  }, [messageId, user?.id]);

  React.useEffect(() => {
    fetchReactions();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`,
        },
        () => fetchReactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, fetchReactions]);

  return { reactions, refresh: fetchReactions };
}
