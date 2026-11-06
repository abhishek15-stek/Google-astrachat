import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  X,
  Minimize2,
  Maximize2,
  Heart,
  Briefcase,
  Star,
  Leaf,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIChat } from '@/hooks/useAIChat';
import { AIPersonality } from '@/lib/aiConversationStore';
import { cn } from '@/lib/utils';
import { FeedbackRequest } from './FeedbackRequest';
import { motion, AnimatePresence } from 'framer-motion';

const PERSONALITY_CONFIG: Record<
  AIPersonality,
  { name: string; icon: React.ReactNode; emoji: string; description: string }
> = {
  assistant: {
    name: 'AstraBot',
    icon: <Bot className="h-4 w-4" />,
    emoji: '🤖',
    description: 'Professional AI assistant',
  },
  friend: {
    name: 'Astra Friend',
    icon: <Heart className="h-4 w-4" />,
    emoji: '💕',
    description: 'Friendly companion chat',
  },
  technical: {
    name: 'Tech Support',
    icon: <Briefcase className="h-4 w-4" />,
    emoji: '🔧',
    description: 'AstraChat technical help',
  },
  creative: {
    name: 'Creative AI',
    icon: <Sparkles className="h-4 w-4" />,
    emoji: '✨',
    description: 'Creative content generator',
  },
  stressRelief: {
    name: 'Stress Relief',
    icon: <Leaf className="h-4 w-4" />,
    emoji: '🧘',
    description: 'Vent & relax (Hindi/English)',
  },
};

export function AIAssistant() {
  const { user } = useAuth();
  const {
    messages,
    personality,
    isGenerating,
    sendMessage,
    retryMessage,
    clearAllConversations,
    appendAssistantSystemMessage,
  } = useAIChat();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [pendingFeedback, setPendingFeedback] = useState<{
    requestId: string;
    question: string;
    questionType: 'star_rating' | 'options' | 'mixed';
    options?: string[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentConfig = PERSONALITY_CONFIG[personality] || PERSONALITY_CONFIG.assistant;

  // Check for pending feedback when opened
  useEffect(() => {
    if (user?.id && isOpen) {
      checkPendingFeedback();
    }
  }, [user?.id, isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen]);

  const checkPendingFeedback = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('feedback_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_answered', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0 && !error) {
        const request = data[0];
        setPendingFeedback({
          requestId: request.id,
          question: request.question,
          questionType: request.question_type as 'star_rating' | 'options' | 'mixed',
          options: Array.isArray(request.options) ? (request.options as string[]) : undefined,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleFeedbackSubmit = async (response: {
    starRating?: number;
    selectedOption?: string;
    textResponse?: string;
  }) => {
    if (!user || !pendingFeedback) return;

    try {
      await supabase.from('feedback_responses').insert({
        request_id: pendingFeedback.requestId,
        user_id: user.id,
        star_rating: response.starRating,
        selected_option: response.selectedOption,
        text_response: response.textResponse,
      });

      await supabase
        .from('feedback_requests')
        .update({ is_answered: true })
        .eq('id', pendingFeedback.requestId);

      const thankYouContent = `Thank you for your feedback! ${
        response.starRating ? `You rated us ${response.starRating} stars ⭐` : ''
      } ${response.selectedOption ? `(${response.selectedOption})` : ''} Your input helps us improve AstraChat! 💖`;

      await appendAssistantSystemMessage(thankYouContent);
      setPendingFeedback(null);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const handleFeedbackDismiss = async () => {
    setPendingFeedback(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput('');
    await sendMessage({ content: text });
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getWelcomeMessage = () => {
    switch (personality) {
      case 'friend':
        return "Hey there! 💕 I'm your friendly companion. Let's chat about anything - share your thoughts, feelings, or just have some fun!";
      case 'technical':
        return "Hello! 🔧 I'm your AstraChat technical support. Having issues with the app? Let me help you troubleshoot!";
      case 'creative':
        return "Hi creative soul! ✨ I can help you write stories, generate ideas, create content, or just brainstorm together!";
      case 'stressRelief':
        return "Hey yaar! 🧘 Main hoon Astra Chill - agar kuch frustration hai ya bas relax karna hai, I'm here for you! Bolo, kya chal raha hai? 💙";
      default:
        return "Hi! I'm AstraBot 👋 Your all-in-one AI assistant. Ask me anything - I'm here to help!";
    }
  };

  if (!isOpen) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-20 right-4 z-50"
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full shadow-lg gradient-primary hover:opacity-90 transition-all hover:scale-110 relative"
          size="icon"
        >
          <Bot className="h-6 w-6 text-white" />
          <Sparkles className="h-3 w-3 text-white absolute top-0 right-0" />
          {pendingFeedback && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -left-1 h-5 w-5 bg-yellow-400 rounded-full flex items-center justify-center"
            >
              <Star className="h-3 w-3 text-yellow-900" />
            </motion.span>
          )}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={cn(
        'fixed z-50 bg-card border border-border rounded-2xl shadow-elevated transition-all duration-300',
        isMinimized
          ? 'bottom-20 right-4 w-72 h-14'
          : 'bottom-20 right-4 w-80 sm:w-96 h-[500px] max-h-[70vh]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-primary/10 to-accent rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center">
              {currentConfig.icon}
            </div>
            <span className="absolute -top-1 -right-1 text-sm">{currentConfig.emoji}</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">{currentConfig.name}</h3>
            {!isMinimized && (
              <p className="text-xs text-muted-foreground">{currentConfig.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 h-[calc(100%-120px)] p-3" ref={scrollRef}>
            <AnimatePresence>
              {pendingFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4"
                >
                  <FeedbackRequest
                    question={pendingFeedback.question}
                    questionType={pendingFeedback.questionType}
                    options={pendingFeedback.options}
                    onSubmit={handleFeedbackSubmit}
                    onDismiss={handleFeedbackDismiss}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {messages.length === 0 && !pendingFeedback ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center mb-3">
                  {currentConfig.icon}
                </div>
                <h4 className="font-medium text-foreground">{currentConfig.name}</h4>
                <p className="text-sm text-muted-foreground mt-2 max-w-[250px]">
                  {getWelcomeMessage()}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setInput('What can you do?')}
                  >
                    What can you do?
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setInput('Help me with something')}
                  >
                    Get help
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'flex flex-col',
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                        msg.role === 'user'
                          ? 'chat-bubble-sent text-foreground'
                          : 'chat-bubble-received'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === 'user' && msg.status === 'error' && (
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        <span>AI failed (message saved)</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryMessage(msg.id)}
                          disabled={isGenerating}
                          className="h-6 px-2 text-[10px]"
                        >
                          <RefreshCw className="h-2.5 w-2.5 mr-1" />
                          Retry
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="chat-bubble-received px-4 py-2">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${currentConfig.name}...`}
                className="flex-1 input-premium"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="btn-send h-10 w-10"
                size="icon"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs text-muted-foreground"
                onClick={clearAllConversations}
              >
                Clear chat history
              </Button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
