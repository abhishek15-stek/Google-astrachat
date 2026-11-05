import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, Sparkles, X, Minimize2, Maximize2, Settings2, Heart, Briefcase, Star, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { FeedbackRequest } from './FeedbackRequest';
import { motion, AnimatePresence } from 'framer-motion';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'feedback';
  content: string;
  timestamp: Date;
  feedbackData?: {
    requestId: string;
    question: string;
    questionType: 'star_rating' | 'options' | 'mixed';
    options?: string[];
  };
}

type AIPersonality = 'assistant' | 'friend' | 'technical' | 'creative' | 'stressRelief';

const PERSONALITY_CONFIG: Record<AIPersonality, { name: string; icon: React.ReactNode; emoji: string; description: string }> = {
  assistant: { 
    name: 'AstraBot', 
    icon: <Bot className="h-4 w-4" />, 
    emoji: '🤖',
    description: 'Professional AI assistant'
  },
  friend: { 
    name: 'Astra Friend', 
    icon: <Heart className="h-4 w-4" />, 
    emoji: '💕',
    description: 'Friendly companion chat'
  },
  technical: { 
    name: 'Tech Support', 
    icon: <Briefcase className="h-4 w-4" />, 
    emoji: '🔧',
    description: 'AstraChat technical help'
  },
  creative: { 
    name: 'Creative AI', 
    icon: <Sparkles className="h-4 w-4" />, 
    emoji: '✨',
    description: 'Creative content generator'
  },
  stressRelief: { 
    name: 'Stress Relief', 
    icon: <Leaf className="h-4 w-4" />, 
    emoji: '🧘',
    description: 'Vent & relax (Hindi/English)'
  },
};

export function AIAssistant() {
  const { user, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [personality, setPersonality] = useState<AIPersonality>('assistant');
  const [pendingFeedback, setPendingFeedback] = useState<{
    requestId: string;
    question: string;
    questionType: 'star_rating' | 'options' | 'mixed';
    options?: string[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentConfig = PERSONALITY_CONFIG[personality];

  // Load conversation history and check for pending feedback
  useEffect(() => {
    if (user && isOpen) {
      loadConversationHistory();
      checkPendingFeedback();
    }
  }, [user, isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadConversationHistory = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (data && !error) {
      setMessages(data.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
      })));
    }
  };

  const checkPendingFeedback = async () => {
    if (!user) return;
    
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
        options: Array.isArray(request.options) ? request.options as string[] : undefined,
      });
    }
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!user) return;
    
    await supabase.from('ai_conversations').insert({
      user_id: user.id,
      role,
      content,
    });
  };

  const handleFeedbackSubmit = async (response: { starRating?: number; selectedOption?: string; textResponse?: string }) => {
    if (!user || !pendingFeedback) return;

    try {
      // Save the feedback response
      await supabase.from('feedback_responses').insert({
        request_id: pendingFeedback.requestId,
        user_id: user.id,
        star_rating: response.starRating,
        selected_option: response.selectedOption,
        text_response: response.textResponse,
      });

      // Mark the request as answered
      await supabase
        .from('feedback_requests')
        .update({ is_answered: true })
        .eq('id', pendingFeedback.requestId);

      // Add thank you message
      const thankYouMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Thank you for your feedback! ${response.starRating ? `You rated us ${response.starRating} stars ⭐` : ''} ${response.selectedOption ? `(${response.selectedOption})` : ''} Your input helps us improve AstraChat! 💖`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, thankYouMessage]);
      await saveMessage('assistant', thankYouMessage.content);

      setPendingFeedback(null);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const handleFeedbackDismiss = async () => {
    setPendingFeedback(null);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Save user message
    await saveMessage('user', userMessage.content);

    try {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role === 'feedback' ? 'assistant' : m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: userMessage.content,
          type: 'chat',
          personality,
          conversationHistory,
          isAdmin,
        },
      });

      if (error) throw error;

      const assistantMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || "I couldn't process that request.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage('assistant', assistantMessage.content);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again later. 🔧",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    
    await supabase
      .from('ai_conversations')
      .delete()
      .eq('user_id', user.id);
    
    setMessages([]);
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
        "fixed z-50 bg-card border border-border rounded-2xl shadow-elevated transition-all duration-300",
        isMinimized
          ? "bottom-20 right-4 w-72 h-14"
          : "bottom-20 right-4 w-80 sm:w-96 h-[500px] max-h-[70vh]"
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
          {/* Personality Selector */}
          {!isMinimized && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>AI Personality</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(PERSONALITY_CONFIG).map(([key, config]) => (
                  <DropdownMenuItem 
                    key={key}
                    onClick={() => setPersonality(key as AIPersonality)}
                    className={cn(personality === key && "bg-accent")}
                  >
                    <span className="mr-2">{config.emoji}</span>
                    {config.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
            {/* Pending Feedback Request */}
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
                
                {/* Quick Suggestions */}
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {personality === 'technical' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("I can't send messages")}
                      >
                        Can't send messages
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("How do I change my profile?")}
                      >
                        Change profile
                      </Button>
                    </>
                  )}
                  {personality === 'creative' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Write me a short story")}
                      >
                        Write a story
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Give me content ideas")}
                      >
                        Content ideas
                      </Button>
                    </>
                  )}
                  {personality === 'friend' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Tell me a joke")}
                      >
                        Tell a joke
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("How's your day?")}
                      >
                        Chat
                      </Button>
                    </>
                  )}
                  {personality === 'assistant' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("What can you do?")}
                      >
                        What can you do?
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Help me with something")}
                      >
                        Get help
                      </Button>
                    </>
                  )}
                  {personality === 'stressRelief' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Bahut frustration ho raha hai")}
                      >
                        I'm frustrated 😤
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => setInput("Help me relax")}
                      >
                        Help me relax 🧘
                      </Button>
                    </>
                  )}
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
                      "flex",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        msg.role === 'user'
                          ? 'chat-bubble-sent text-foreground'
                          : 'chat-bubble-received'
                      )}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
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
                onKeyPress={handleKeyPress}
                placeholder={`Ask ${currentConfig.name}...`}
                className="flex-1 input-premium"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="btn-send h-10 w-10"
                size="icon"
              >
                {isLoading ? (
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
                onClick={clearHistory}
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
