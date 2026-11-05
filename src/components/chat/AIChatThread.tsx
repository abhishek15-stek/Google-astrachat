import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Sparkles, Heart, Briefcase, Leaf, ArrowLeft, Phone, Video, MoreVertical, Info, VolumeX, Volume2, Search, Trash2, Flag, Mic, ScreenShare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { FeedbackRequest } from './FeedbackRequest';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { AIFileUpload, AIFilePreview, AIMessageAttachment } from './AIFileUpload';
import { AIVoiceInput } from './AIVoiceInput';
import { ScreenCapture } from './ScreenCapture';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'feedback';
  content: string;
  timestamp: Date;
  attachment?: {
    url: string;
    type: string;
    name?: string;
  };
}

type AIPersonality = 'assistant' | 'friend' | 'technical' | 'creative' | 'stressRelief';

const PERSONALITY_CONFIG: Record<AIPersonality, { name: string; icon: React.ReactNode; emoji: string; description: string }> = {
  assistant: { name: 'AstraBot', icon: <Bot className="h-4 w-4" />, emoji: '🤖', description: 'Professional AI assistant' },
  friend: { name: 'Astra Friend', icon: <Heart className="h-4 w-4" />, emoji: '💕', description: 'Friendly companion chat' },
  technical: { name: 'Tech Support', icon: <Briefcase className="h-4 w-4" />, emoji: '🔧', description: 'AstraChat technical help' },
  creative: { name: 'Creative AI', icon: <Sparkles className="h-4 w-4" />, emoji: '✨', description: 'Creative content generator' },
  stressRelief: { name: 'Stress Relief', icon: <Leaf className="h-4 w-4" />, emoji: '🧘', description: 'Vent & relax (Hindi/English)' },
};

interface AIChatThreadProps {
  className?: string;
  onBack?: () => void;
}

export function AIChatThread({ className, onBack }: AIChatThreadProps) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [personality, setPersonality] = useState<AIPersonality>('assistant');
  const [isMuted, setIsMuted] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<{
    requestId: string;
    question: string;
    questionType: 'star_rating' | 'options' | 'mixed';
    options?: string[];
  } | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showScreenCapture, setShowScreenCapture] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentConfig = PERSONALITY_CONFIG[personality];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (user) {
      loadConversationHistory();
      checkPendingFeedback();
      triggerAutoFeedback();
    }
  }, [user]);

  const loadConversationHistory = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100);

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

  const triggerAutoFeedback = async () => {
    if (!user) return;
    try {
      await supabase.functions.invoke('auto-feedback', { body: { userId: user.id } });
      setTimeout(checkPendingFeedback, 1000);
    } catch (error) {
      console.log('Auto-feedback check skipped');
    }
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!user) return;
    await supabase.from('ai_conversations').insert({ user_id: user.id, role, content });
  };

  const handleFeedbackSubmit = async (response: { starRating?: number; selectedOption?: string; textResponse?: string }) => {
    if (!user || !pendingFeedback) return;
    try {
      await supabase.from('feedback_responses').insert({
        request_id: pendingFeedback.requestId,
        user_id: user.id,
        star_rating: response.starRating,
        selected_option: response.selectedOption,
        text_response: response.textResponse,
      });
      await supabase.from('feedback_requests').update({ is_answered: true }).eq('id', pendingFeedback.requestId);

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

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || isLoading || !user) return;

    const messageContent = attachedFile ? `${input.trim()} [Attached: ${attachedFile.name}]` : input.trim();
    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
      attachment: attachedFile || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedFile(null);
    setIsLoading(true);
    await saveMessage('user', messageContent);

    try {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role === 'feedback' ? 'assistant' : m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: messageContent,
          type: 'chat',
          personality,
          conversationHistory,
          isAdmin,
          userId: user.id,
          attachment: attachedFile,
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

  const handleVoiceSend = async (audioUrl: string, duration: number) => {
    if (!user) return;
    const voiceMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `🎤 Voice message (${duration}s)`,
      timestamp: new Date(),
      attachment: { url: audioUrl, type: 'audio/webm', name: 'Voice message' },
    };

    setMessages(prev => [...prev, voiceMessage]);
    setShowVoiceInput(false);
    setIsLoading(true);
    await saveMessage('user', voiceMessage.content);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: `User sent a voice message (${duration} seconds). Please acknowledge and respond helpfully.`,
          type: 'chat',
          personality,
          isAdmin,
          userId: user.id,
          hasVoice: true,
          voiceUrl: audioUrl,
        },
      });

      if (error) throw error;

      const assistantMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || "I received your voice message! 🎤",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage('assistant', assistantMessage.content);
    } catch (error) {
      console.error('Voice AI error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    toast({
      title: isMuted ? 'Notifications enabled' : 'Notifications muted',
      description: isMuted ? 'You will receive AI notifications' : "You won't receive AI notifications",
    });
  };

  const handleClearChat = async () => {
    if (!user) return;
    await supabase.from('ai_conversations').delete().eq('user_id', user.id);
    setMessages([]);
    toast({ title: 'Chat cleared', description: 'Your AI conversation history has been cleared' });
  };

  const handleViewInfo = () => {
    toast({
      title: 'AstraBot AI',
      description: `Current mode: ${currentConfig.name} - ${currentConfig.description}`,
    });
  };

  const getWelcomeMessage = () => {
    switch (personality) {
      case 'friend': return "Hey there! 💕 I'm your friendly companion. Let's chat about anything!";
      case 'technical': return "Hello! 🔧 I'm your AstraChat tech support. How can I help?";
      case 'creative': return "Hi creative soul! ✨ Let's create something amazing together!";
      case 'stressRelief': return "Hey yaar! 🧘 Kya chal raha hai? I'm here if you need to vent 💙";
      default: return "Hi! I'm AstraBot 👋 Ask me anything - I'm here to help!";
    }
  };

  const handleScreenCaptureSend = (url: string, type: 'screenshot' | 'video') => {
    const captureMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: type === 'screenshot' ? '📸 Shared a screenshot' : '🎬 Shared a screen recording',
      timestamp: new Date(),
      attachment: { url, type: type === 'screenshot' ? 'image/png' : 'video/webm', name: type === 'screenshot' ? 'Screenshot' : 'Recording' },
    };
    setMessages(prev => [...prev, captureMessage]);
    saveMessage('user', captureMessage.content);
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Header */}
      <div className="h-16 px-4 border-b border-border flex items-center gap-3 bg-card/50 backdrop-blur-sm flex-shrink-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-lg flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <Avatar className="h-10 w-10 border-2 border-border">
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold truncate">{currentConfig.name}</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              AI Assistant - Always Online
            </p>
          </div>
        </div>
        
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex flex-shrink-0" onClick={() => setShowScreenCapture(true)}>
          <ScreenShare className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex flex-shrink-0">
          <Phone className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex flex-shrink-0">
          <Video className="h-4 w-4" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border border-border">
            <DropdownMenuItem onClick={handleViewInfo}>
              <Info className="h-4 w-4 mr-2" />
              AI Info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowScreenCapture(true)}>
              <ScreenShare className="h-4 w-4 mr-2" />
              Screen Capture
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Phone className="h-4 w-4 mr-2" />
              Voice call
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Video className="h-4 w-4 mr-2" />
              Video call
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleMuteToggle}>
              {isMuted ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
              {isMuted ? 'Unmute notifications' : 'Mute notifications'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Search className="h-4 w-4 mr-2" />
              Search in chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearChat}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear chat
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Flag className="h-4 w-4 mr-2" />
              Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Personality Selector */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Mode:</span>
          <div className="flex gap-1">
            {Object.entries(PERSONALITY_CONFIG).map(([key, config]) => (
              <Button
                key={key}
                variant={personality === key ? "default" : "ghost"}
                size="sm"
                onClick={() => setPersonality(key as AIPersonality)}
                className="gap-1 h-8 px-2 whitespace-nowrap"
              >
                <span>{config.emoji}</span>
                <span className="hidden sm:inline text-xs">{config.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          <AnimatePresence>
            {pendingFeedback && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-4">
                <FeedbackRequest
                  question={pendingFeedback.question}
                  questionType={pendingFeedback.questionType}
                  options={pendingFeedback.options}
                  onSubmit={handleFeedbackSubmit}
                  onDismiss={() => setPendingFeedback(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length === 0 && !pendingFeedback ? (
            <div className="flex flex-col items-center justify-center text-center p-8 min-h-[50vh]">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                <Bot className="h-10 w-10 text-primary-foreground" />
              </div>
              <h4 className="font-bold text-xl">{currentConfig.name}</h4>
              <p className="text-muted-foreground mt-2 max-w-md">{getWelcomeMessage()}</p>
              <p className="text-xs text-muted-foreground mt-4">Select a mode above to change how I respond ↑</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto pb-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div className={cn("max-w-[80%] rounded-2xl px-4 py-3", msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                    {msg.attachment && (
                      <div className="mb-2">
                        <AIMessageAttachment url={msg.attachment.url} type={msg.attachment.type} name={msg.attachment.name} />
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-3 rounded-2xl">
                    <div className="typing-indicator"><span></span><span></span><span></span></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Attached File Preview */}
      {attachedFile && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex-shrink-0">
          <AIFilePreview file={attachedFile} onRemove={() => setAttachedFile(null)} />
        </div>
      )}

      {/* Voice Input */}
      <AnimatePresence>
        {showVoiceInput && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-4 py-2 border-t border-border flex-shrink-0">
            <AIVoiceInput isOpen={showVoiceInput} onVoiceSend={handleVoiceSend} onCancel={() => setShowVoiceInput(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      {!showVoiceInput && (
        <div className="p-4 border-t border-border bg-card/50 flex-shrink-0">
          <div className="flex gap-2 max-w-3xl mx-auto items-center">
            <AIFileUpload onFileSelect={(file) => setAttachedFile(file)} disabled={isLoading} />
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${currentConfig.name}...`}
              className="flex-1 h-12 px-4 rounded-xl"
              disabled={isLoading}
            />
            <Button variant="ghost" size="icon" onClick={() => setShowVoiceInput(true)} disabled={isLoading} className="h-10 w-10 rounded-full">
              <Mic className="h-5 w-5" />
            </Button>
            <Button onClick={handleSend} disabled={(!input.trim() && !attachedFile) || isLoading} className="h-12 w-12 rounded-xl" size="icon">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Screen Capture Dialog */}
      <ScreenCapture
        isOpen={showScreenCapture}
        onClose={() => setShowScreenCapture(false)}
        onCaptureSend={handleScreenCaptureSend}
        recipientName={currentConfig.name}
      />
    </div>
  );
}
