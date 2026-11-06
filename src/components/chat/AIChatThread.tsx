import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Heart,
  Briefcase,
  Leaf,
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Info,
  VolumeX,
  Volume2,
  Search,
  Trash2,
  Flag,
  Mic,
  ScreenShare,
  Image,
  Plus,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  History,
} from 'lucide-react';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIChat } from '@/hooks/useAIChat';
import { AIPersonality } from '@/lib/aiConversationStore';
import { cn } from '@/lib/utils';
import { FeedbackRequest } from './FeedbackRequest';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { AIFileUpload, AIFilePreview, AIMessageAttachment } from './AIFileUpload';
import { AIVoiceInput } from './AIVoiceInput';
import { ScreenCapture } from './ScreenCapture';
import { format } from 'date-fns';

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

interface AIChatThreadProps {
  className?: string;
  onBack?: () => void;
}

export function AIChatThread({ className, onBack }: AIChatThreadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    messages,
    conversations,
    activeConversationId,
    personality,
    isLoadingHistory,
    isGenerating,
    hasMoreHistory,
    retrievalError,
    setPersonality,
    selectConversation,
    createNewConversation,
    deleteConversation,
    clearAllConversations,
    sendMessage,
    retryMessage,
    refreshHistory,
    loadMoreHistory,
    appendAssistantSystemMessage,
  } = useAIChat();

  const [input, setInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<{
    requestId: string;
    question: string;
    questionType: 'star_rating' | 'options' | 'mixed';
    options?: string[];
  } | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showScreenCapture, setShowScreenCapture] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentConfig = PERSONALITY_CONFIG[personality] || PERSONALITY_CONFIG.assistant;
  const activeConvSummary = conversations.find((c) => c.id === activeConversationId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, activeConversationId, scrollToBottom]);

  // Check pending feedback keyed by stable user.id
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const checkPendingFeedback = async () => {
      try {
        const { data, error } = await supabase
          .from('feedback_requests')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_answered', false)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!cancelled && data && data.length > 0 && !error) {
          const request = data[0];
          setPendingFeedback({
            requestId: request.id,
            question: request.question,
            questionType: request.question_type as 'star_rating' | 'options' | 'mixed',
            options: Array.isArray(request.options) ? (request.options as string[]) : undefined,
          });
        }
      } catch {
        // ignore feedback check failure
      }
    };

    checkPendingFeedback();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || !user) return;

    const messageContent = attachedFile
      ? `${input.trim() ? `${input.trim()} ` : ''}[Attached: ${attachedFile.name}]`
      : input.trim();
    const currentAttachment = attachedFile ? { ...attachedFile } : undefined;

    setInput('');
    setAttachedFile(null);

    await sendMessage({
      content: messageContent,
      attachment: currentAttachment,
    });

    inputRef.current?.focus();
  };

  const handleImageGenerateClick = async () => {
    if (!input.trim() || isGenerating || !user) return;
    const prompt = input.trim();
    setInput('');
    await sendMessage({
      content: `🎨 Generate image: ${prompt}`,
      generateImage: true,
    });
    inputRef.current?.focus();
  };

  const handleVoiceSend = async (audioUrl: string, duration: number) => {
    if (!user) return;
    setShowVoiceInput(false);
    await sendMessage({
      content: `🎤 Voice message (${duration}s)`,
      attachment: { url: audioUrl, type: 'audio/webm', name: 'Voice message' },
      hasVoice: true,
      voicePromptOverride: `User sent a voice message (${duration} seconds). Please acknowledge and respond helpfully.`,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const handleDeleteCurrentConversation = async () => {
    if (!user) return;
    await deleteConversation(activeConversationId);
    toast({
      title: 'Conversation deleted',
      description: 'The selected AI conversation has been deleted.',
    });
  };

  const handleClearAllChats = async () => {
    if (!user) return;
    await clearAllConversations();
    toast({
      title: 'All AI chats cleared',
      description: 'Your AI conversation history has been cleared.',
    });
  };

  const handleViewInfo = () => {
    toast({
      title: 'AstraBot AI',
      description: `Current mode: ${currentConfig.name} - ${currentConfig.description}`,
    });
  };

  const getWelcomeMessage = () => {
    switch (personality) {
      case 'friend':
        return "Hey there! 💕 I'm your friendly companion. Let's chat about anything!";
      case 'technical':
        return "Hello! 🔧 I'm your AstraChat tech support. How can I help?";
      case 'creative':
        return "Hi creative soul! ✨ Let's create something amazing together!";
      case 'stressRelief':
        return "Hey yaar! 🧘 Kya chal raha hai? I'm here if you need to vent 💙";
      default:
        return "Hi! I'm AstraBot 👋 Ask me anything - I'm here to help!";
    }
  };

  const handleScreenCaptureSend = async (url: string, type: 'screenshot' | 'video') => {
    await sendMessage({
      content: type === 'screenshot' ? '📸 Shared a screenshot' : '🎬 Shared a screen recording',
      attachment: {
        url,
        type: type === 'screenshot' ? 'image/png' : 'video/webm',
        name: type === 'screenshot' ? 'Screenshot' : 'Recording',
      },
    });
  };

  const visibleMessages = searchFilter.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchFilter.toLowerCase()))
    : messages;

  return (
    <div className={cn('flex flex-col h-full min-h-0 overflow-hidden', className)} data-testid="ai-chat-thread">
      {/* Header */}
      <div className="h-16 px-4 border-b border-border flex items-center gap-2 sm:gap-3 bg-card/50 backdrop-blur-sm flex-shrink-0 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-9 w-9 rounded-lg flex-shrink-0"
          data-testid="ai-chat-back-btn"
        >
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-bold truncate text-sm sm:text-base">{currentConfig.name}</h2>
              {/* Conversation Switcher Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 max-w-[160px] sm:max-w-[200px]"
                    data-testid="ai-conversation-selector"
                  >
                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{activeConvSummary?.title || 'General AI Chat'}</span>
                    <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 bg-popover border border-border">
                  <DropdownMenuLabel className="flex items-center justify-between text-xs">
                    <span>Saved Conversations ({conversations.length})</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1 text-primary"
                      onClick={() => createNewConversation()}
                      data-testid="ai-new-conversation-btn"
                    >
                      <Plus className="h-3 w-3" />
                      New Chat
                    </Button>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {conversations.map((conv) => (
                    <DropdownMenuItem
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={cn(
                        'flex flex-col items-start gap-0.5 py-2 cursor-pointer',
                        conv.id === activeConversationId && 'bg-accent/60 font-medium'
                      )}
                      data-testid={`ai-conv-item-${conv.id}`}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="truncate text-xs font-semibold">{conv.title}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {conv.messageCount} msgs
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate w-full">
                        {conv.lastMessage}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span>{currentConfig.description} • Permanent History</span>
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => createNewConversation()}
          className="h-8 px-2.5 text-xs gap-1 hidden md:flex flex-shrink-0"
          title="Start a new AI conversation"
          data-testid="ai-header-new-chat-btn"
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </Button>

        {/* Personality / Mode Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 rounded-lg text-xs gap-1.5 flex-shrink-0"
              title="Switch AI Mode"
              data-testid="ai-mode-selector"
            >
              <span>{currentConfig.emoji}</span>
              <span className="hidden sm:inline">{currentConfig.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border border-border">
            <DropdownMenuLabel className="text-xs">Select AI Personality Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(PERSONALITY_CONFIG) as AIPersonality[]).map((key) => {
              const cfg = PERSONALITY_CONFIG[key];
              return (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setPersonality(key)}
                  className={cn('gap-2 cursor-pointer', personality === key && 'bg-accent font-medium')}
                >
                  <span>{cfg.emoji}</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{cfg.name}</span>
                    <span className="text-[10px] text-muted-foreground">{cfg.description}</span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg hidden sm:flex flex-shrink-0"
          onClick={() => setShowScreenCapture(true)}
        >
          <ScreenShare className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border border-border">
            <DropdownMenuItem onClick={() => createNewConversation()}>
              <Plus className="h-4 w-4 mr-2" />
              New conversation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => refreshHistory()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync history from DB
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleViewInfo}>
              <Info className="h-4 w-4 mr-2" />
              AI Info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowScreenCapture(true)}>
              <ScreenShare className="h-4 w-4 mr-2" />
              Screen Capture
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleMuteToggle}>
              {isMuted ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
              {isMuted ? 'Unmute notifications' : 'Mute notifications'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowSearchBar((s) => !s)}>
              <Search className="h-4 w-4 mr-2" />
              Search in chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDeleteCurrentConversation}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete current conversation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearAllChats} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear all AI conversations
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Optional in-chat search bar */}
      {showSearchBar && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 flex-shrink-0">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter messages in this conversation..."
            className="h-8 text-xs"
          />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearchFilter(''); setShowSearchBar(false); }}>
            Close
          </Button>
        </div>
      )}

      {/* Database Retrieval Error Banner (Test 9: Shows clear error without replacing existing messages) */}
      {retrievalError && (
        <div
          className="px-4 py-2.5 bg-destructive/10 border-b border-destructive/30 flex items-center justify-between gap-3 flex-shrink-0"
          data-testid="ai-retrieval-error-banner"
        >
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{retrievalError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshHistory()}
            className="h-7 text-xs gap-1 flex-shrink-0"
            data-testid="ai-retrieval-retry-btn"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4">
          {/* Load older messages pagination button */}
          {hasMoreHistory && (
            <div className="flex justify-center mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMoreHistory}
                disabled={isLoadingHistory}
                className="text-xs gap-1.5"
              >
                {isLoadingHistory ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <History className="h-3.5 w-3.5" />
                )}
                Load older messages
              </Button>
            </div>
          )}

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
                  onDismiss={() => setPendingFeedback(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {isLoadingHistory && visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 min-h-[45vh]">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Loading your saved conversation...</p>
            </div>
          ) : visibleMessages.length === 0 && !pendingFeedback ? (
            <div className="flex flex-col items-center justify-center text-center p-8 min-h-[50vh]">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                <Bot className="h-10 w-10 text-primary-foreground" />
              </div>
              <h4 className="font-bold text-xl">{currentConfig.name}</h4>
              <p className="text-muted-foreground mt-2 max-w-md">{getWelcomeMessage()}</p>
              <p className="text-xs text-muted-foreground mt-4">
                All messages are permanently saved to your account
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto pb-4" data-testid="ai-messages-list">
              {visibleMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
                  data-testid={`ai-message-${msg.role}`}
                  data-message-id={msg.id}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    {msg.attachment && (
                      <div className="mb-2">
                        <AIMessageAttachment
                          url={msg.attachment.url}
                          type={msg.attachment.type}
                          name={msg.attachment.name}
                        />
                      </div>
                    )}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mb-2 space-y-2">
                        {msg.images.map((imgUrl, idx) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt="AI generated"
                            className="rounded-lg max-w-full max-h-80 object-contain"
                          />
                        ))}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 mt-1 text-[10px]',
                        msg.role === 'user' ? 'justify-end text-primary-foreground/75' : 'text-muted-foreground'
                      )}
                    >
                      <span>{format(msg.timestamp, 'HH:mm')}</span>
                      {msg.persisted && (
                        <span className="inline-flex items-center gap-0.5" title="Saved to database">
                          <CheckCircle2 className="h-3 w-3" />
                          Saved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Separate Error Banner when AI failed for this user message (Phase 3 & Phase 7) */}
                  {msg.role === 'user' && msg.status === 'error' && (
                    <div
                      className="mt-1.5 max-w-[80%] rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between gap-3"
                      data-testid="ai-message-error-notice"
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          {msg.errorMessage || 'AI temporarily unavailable. Your message is safely saved.'}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryMessage(msg.id)}
                        disabled={isGenerating}
                        className="h-7 px-2.5 text-xs gap-1 border-destructive/40 hover:bg-destructive/20 flex-shrink-0"
                        data-testid="ai-retry-message-btn"
                      >
                        <RefreshCw className={cn('h-3 w-3', isGenerating && 'animate-spin')} />
                        Retry AI
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
              {isGenerating && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-3 rounded-2xl">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
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
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 border-t border-border flex-shrink-0"
          >
            <AIVoiceInput
              isOpen={showVoiceInput}
              onVoiceSend={handleVoiceSend}
              onCancel={() => setShowVoiceInput(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      {!showVoiceInput && (
        <div className="p-4 border-t border-border bg-card/50 flex-shrink-0">
          <div className="flex gap-2 max-w-3xl mx-auto items-center">
            <AIFileUpload onFileSelect={(file) => setAttachedFile(file)} disabled={isGenerating} />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleImageGenerateClick}
              disabled={!input.trim() || isGenerating}
              className="h-10 w-10 rounded-full"
              title="Generate image from prompt"
            >
              <Image className="h-5 w-5" />
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${currentConfig.name}…  Try /imagine <prompt> or attach a photo/video`}
              className="flex-1 h-12 px-4 rounded-xl"
              data-testid="ai-chat-input"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVoiceInput(true)}
              disabled={isGenerating}
              className="h-10 w-10 rounded-full"
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Button
              onClick={handleSend}
              disabled={!input.trim() && !attachedFile}
              className="h-12 w-12 rounded-xl"
              size="icon"
              data-testid="ai-chat-send-btn"
            >
              {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
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
