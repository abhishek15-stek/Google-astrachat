import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SmartRepliesProps {
  lastMessage: string;
  onSelectReply: (reply: string) => void;
}

export function SmartReplies({ lastMessage, onSelectReply }: SmartRepliesProps) {
  const [replies, setReplies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  useEffect(() => {
    // Reset when message changes
    setReplies([]);
    setShowReplies(false);
  }, [lastMessage]);

  const generateReplies = async () => {
    if (!lastMessage || isLoading) return;

    setIsLoading(true);
    setShowReplies(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: lastMessage,
          type: 'smart_reply',
        },
      });

      if (error) throw error;

      // Parse the response - it should be JSON with replies array
      try {
        const parsed = JSON.parse(data.response);
        if (parsed.replies && Array.isArray(parsed.replies)) {
          setReplies(parsed.replies);
        }
      } catch {
        // If parsing fails, try to extract replies from text
        const lines = data.response.split('\n').filter((l: string) => l.trim());
        setReplies(lines.slice(0, 3));
      }
    } catch (error) {
      console.error('Error generating smart replies:', error);
      setReplies([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!lastMessage) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {!showReplies ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={generateReplies}
          className="h-7 text-xs text-muted-foreground hover:text-primary"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Smart Reply
        </Button>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating...
        </div>
      ) : replies.length > 0 ? (
        <>
          {replies.map((reply, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => onSelectReply(reply)}
              className="h-7 text-xs animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {reply}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReplies(false)}
            className="h-7 text-xs text-muted-foreground"
          >
            Hide
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">No suggestions available</span>
      )}
    </div>
  );
}
