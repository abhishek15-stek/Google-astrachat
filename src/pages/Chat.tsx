import { useAuth } from '@/hooks/useAuth';
import { useMessages, ChatThread } from '@/hooks/useMessages';
import { useTheme } from '@/hooks/useTheme';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { FileUpload } from '@/components/chat/FileUpload';
import { ProfileSettings } from '@/components/chat/ProfileSettings';
import { AIAssistant } from '@/components/chat/AIAssistant';
import { AIChatThread } from '@/components/chat/AIChatThread';
import { MessageReactions, useMessageReactions } from '@/components/chat/MessageReactions';
import { ReadReceipts, useMarkAsRead } from '@/components/chat/ReadReceipts';
import { WallpaperPickerDialog, useWallpaperPicker } from '@/components/chat/ChatWallpaper';
import { StatusStories } from '@/components/chat/StatusStories';
import { VoiceRecorder, VoiceMessage } from '@/components/chat/VoiceRecorder';
import { SmartReplies } from '@/components/chat/SmartReplies';
import { ScreenCapture } from '@/components/chat/ScreenCapture';
import { LiveScreenShare, ScreenShareViewer } from '@/components/chat/LiveScreenShare';
import { IncomingCallScreen, OutgoingCallScreen } from '@/components/chat/CallUI';
import { CallStage } from '@/features/call/CallStage';
import { MediaLightbox } from '@/components/chat/MediaLightbox';
import { useCall } from '@/hooks/useCall';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MessageCircle, 
  Send, 
  Moon, 
  Sun, 
  LogOut, 
  Users, 
  Shield, 
  Menu, 
  X,
  Sparkles,
  CheckCheck,
  Search,
  MoreVertical,
  Phone,
  Video,
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Trash2,
  Volume2,
  VolumeX,
  Info,
  UserPlus,
  Flag,
  Palette,
  Mic,
  Bot,
  ScreenShare,
  Monitor
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Wallpaper styles helper
const WALLPAPER_STYLES: Record<string, string> = {
  'default': 'bg-background',
  'dark': 'bg-slate-900',
  'light': 'bg-slate-100',
  'green': 'bg-emerald-900',
  'blue': 'bg-blue-900',
  'purple': 'bg-purple-900',
  'rose': 'bg-rose-900',
  'amber': 'bg-amber-900',
  'gradient-sunset': 'bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600',
  'gradient-ocean': 'bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600',
  'gradient-forest': 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600',
  'gradient-aurora': 'bg-gradient-to-br from-green-400 via-purple-500 to-pink-500',
  'gradient-night': 'bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900',
  'gradient-candy': 'bg-gradient-to-br from-pink-400 via-rose-400 to-red-400',
  'gradient-mint': 'bg-gradient-to-br from-teal-400 via-cyan-400 to-sky-500',
  'gradient-royal': 'bg-gradient-to-br from-amber-400 via-orange-500 to-red-600',
  'pattern-dots': 'bg-dots',
  'pattern-grid': 'bg-grid',
};

const WALLPAPER_IMAGES: Record<string, string> = {
  'wp-mountains': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
  'wp-beach': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
  'wp-forest': 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
  'wp-city': 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800',
  'wp-stars': 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800',
  'wp-abstract': 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800',
};

interface OnlineUser {
  id: string;
  lastSeen: Date;
}

// Message with reactions component
function MessageBubble({ 
  msg, 
  isMine, 
  showAvatar, 
  showName, 
  getInitials, 
  renderMessageContent,
  activeThread,
}: {
  msg: any;
  isMine: boolean;
  showAvatar: boolean;
  showName: boolean;
  getInitials: (name: string) => string;
  renderMessageContent: (content: string) => React.ReactNode;
  activeThread: ChatThread;
}) {
  const { reactions, refresh } = useMessageReactions(msg.id);
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDeleteForMe = () => {
    // Hide message locally (client-side only)
    const hidden = JSON.parse(localStorage.getItem('hidden_messages') || '[]');
    hidden.push(msg.id);
    localStorage.setItem('hidden_messages', JSON.stringify(hidden));
    toast({ title: 'Message hidden', description: 'This message has been removed from your view.' });
    // Force re-render by dispatching storage event
    window.dispatchEvent(new Event('storage'));
  };

  const handleDeleteForEveryone = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('messages').delete().eq('id', msg.id);
      if (error) throw error;
      toast({ title: 'Message deleted', description: 'This message has been deleted for everyone.' });
    } catch (error) {
      toast({ title: 'Delete failed', description: 'Could not delete this message.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(msg.content);
    toast({ title: 'Copied', description: 'Message copied to clipboard.' });
  };

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}>
      {!isMine && showAvatar && (
        <Avatar className="h-8 w-8 mr-2 mt-auto border border-border flex-shrink-0">
          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
            {getInitials(msg.sender?.display_name || msg.sender?.email || '?')}
          </AvatarFallback>
        </Avatar>
      )}
      {!isMine && !showAvatar && <div className="w-10 flex-shrink-0" />}
      
      <div className="max-w-[75%] lg:max-w-[65%] relative">
        <div className={`${isMine ? 'chat-bubble-sent' : 'chat-bubble-received'} px-4 py-2.5`}>
          {showName && (
            <p className="text-xs font-semibold text-primary mb-1">
              {msg.sender?.display_name || msg.sender?.email}
            </p>
          )}
          <div className="text-sm leading-relaxed break-words">
            {renderMessageContent(msg.content)}
          </div>
          <div className={`flex items-center gap-1.5 mt-1 ${isMine ? 'justify-end' : ''}`}>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(msg.created_at), 'HH:mm')}
            </span>
            {isMine && (
              <ReadReceipts
                messageId={msg.id}
                senderId={msg.sender_id}
                threadId={activeThread.id}
                threadType={activeThread.type}
              />
            )}
          </div>
        </div>

        {/* Three-dot message menu */}
        <div className={`absolute top-1 ${isMine ? 'left-0 -translate-x-full pl-1' : 'right-0 translate-x-full pr-1'} opacity-0 group-hover:opacity-100 transition-opacity`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isMine ? "start" : "end"} className="w-48 bg-popover border border-border">
              <DropdownMenuItem onClick={handleCopyMessage}>
                📋 Copy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteForMe} className="text-muted-foreground">
                🗑️ Delete for me
              </DropdownMenuItem>
              {isMine && (
                <DropdownMenuItem onClick={handleDeleteForEveryone} disabled={deleting} className="text-destructive">
                  🗑️ Delete for everyone
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Reactions */}
        <div className="mt-1">
          <MessageReactions
            messageId={msg.id}
            reactions={reactions}
            onReactionChange={refresh}
          />
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const { user, isAdmin, canAccessDashboard, signOut } = useAuth();
  const { threads, messages, activeThread, setActiveThread, sendMessage, loading } = useMessages();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOpen: wallpaperOpen, setIsOpen: setWallpaperOpen, wallpaper, saveWallpaper } = useWallpaperPicker();
  
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ url: string; type: string } | null>(null);
  const [userProfile, setUserProfile] = useState<{ display_name: string | null; avatar_url: string | null }>({ display_name: null, avatar_url: null });
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showScreenCapture, setShowScreenCapture] = useState(false);
  const [showScreenShare, setShowScreenShare] = useState(false);
  const [screenShareTarget, setScreenShareTarget] = useState<{ id: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const callManager = useCall();
  
  const { typingUsers, handleTyping, stopTyping } = useTypingIndicator(
    activeThread?.type || null,
    activeThread?.id || null
  );

  const { markAsRead } = useMarkAsRead(activeThread?.id || '', activeThread?.type || 'admin');

  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isInitialLoad.current) {
      // On initial load / thread switch, jump instantly (no animation = no bump)
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      isInitialLoad.current = false;
    } else {
      // For new messages, smooth scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (activeThread && messages.length > 0 && user) {
      const otherMessages = messages
        .filter(m => m.sender_id !== user.id)
        .map(m => m.id);
      markAsRead(otherMessages);
    }
  }, [activeThread, messages, user, markAsRead]);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setUserProfile(data);
      }
    };
    fetchProfile();
  }, [user]);

  // Real-time presence tracking
  useEffect(() => {
    if (!user) return;

    // Update own presence
    const updatePresence = async () => {
      await supabase
        .from('profiles')
        .update({ last_active: new Date().toISOString() })
        .eq('id', user.id);
    };

    updatePresence();
    const presenceInterval = setInterval(updatePresence, 30000);

    // Listen for profile changes to track online status
    const channel = supabase
      .channel('presence-tracking')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'last_active=neq.null',
        },
        (payload) => {
          const updatedProfile = payload.new as { id: string; last_active: string };
          if (updatedProfile.last_active) {
            setOnlineUsers(prev => {
              const newMap = new Map(prev);
              newMap.set(updatedProfile.id, {
                id: updatedProfile.id,
                lastSeen: new Date(updatedProfile.last_active)
              });
              return newMap;
            });
          }
        }
      )
      .subscribe();

    // Initial fetch of all active users
    const fetchOnlineUsers = async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('profiles')
        .select('id, last_active')
        .gt('last_active', fiveMinutesAgo);

      if (data) {
        const newMap = new Map<string, OnlineUser>();
        data.forEach(p => {
          if (p.last_active) {
            newMap.set(p.id, { id: p.id, lastSeen: new Date(p.last_active) });
          }
        });
        setOnlineUsers(newMap);
      }
    };

    fetchOnlineUsers();
    const onlineInterval = setInterval(fetchOnlineUsers, 60000);

    return () => {
      clearInterval(presenceInterval);
      clearInterval(onlineInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const isUserOnline = useCallback((userId: string) => {
    const userPresence = onlineUsers.get(userId);
    if (!userPresence) return false;
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return userPresence.lastSeen > fiveMinutesAgo;
  }, [onlineUsers]);

  const getOnlineCount = useCallback(() => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let count = 0;
    onlineUsers.forEach((presence) => {
      if (presence.lastSeen > fiveMinutesAgo) count++;
    });
    return count;
  }, [onlineUsers]);

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setUserProfile(data);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessageInput(prev => prev + emoji);
  };

  const handleFileUploaded = (url: string, type: string) => {
    setPendingFile({ url, type });
  };

  const resolveDirectCallTarget = async () => {
    if (!activeThread) return null;
    if (activeThread.type !== 'admin') return activeThread.id;
    if (isAdmin) return activeThread.id;
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    if (error || !data?.user_id) throw new Error('Admin receiver is not available right now.');
    return data.user_id;
  };

  const handleStartThreadCall = async (type: 'voice' | 'video') => {
    if (!activeThread) return;
    if (activeThread.type === 'group') {
      await callManager.startGroupCall(activeThread.id, type);
      return;
    }
    const receiverId = await resolveDirectCallTarget();
    if (receiverId) await callManager.startCall(receiverId, type);
  };

  const handleOpenLiveScreenShare = async () => {
    if (!activeThread || !user) return;
    if (activeThread.type === 'group') {
      const { data: members, error } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', activeThread.id);
      if (error) {
        toast({ title: 'Screen share unavailable', description: error.message, variant: 'destructive' });
        return;
      }
      const memberIds = (members || []).map((m) => m.user_id).filter((id) => id !== user.id);
      const { data: profiles, error: profileError } = memberIds.length
        ? await supabase.from('profiles').select('id, display_name, email').in('id', memberIds)
        : { data: [], error: null } as any;
      if (profileError) {
        toast({ title: 'Screen share unavailable', description: profileError.message, variant: 'destructive' });
        return;
      }
      const target = profiles?.[0];
      if (!target) {
        toast({ title: 'No receiver available', description: 'There is no other reachable member in this group.', variant: 'destructive' });
        return;
      }
      setScreenShareTarget({ id: target.id, name: target.display_name || target.email || activeThread.name });
      setShowScreenShare(true);
      return;
    }
    try {
      const receiverId = await resolveDirectCallTarget();
      if (!receiverId) return;
      setScreenShareTarget({ id: receiverId, name: activeThread.name });
      setShowScreenShare(true);
    } catch (e: any) {
      toast({ title: 'Screen share unavailable', description: e?.message || 'Receiver is not available.', variant: 'destructive' });
    }
  };

  const downloadMedia = async (url: string, name: string) => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleVoiceSend = async (audioUrl: string, duration: number) => {
    try {
      await sendMessage(`🎤 ${audioUrl}`);
      setIsRecordingVoice(false);
    } catch (error) {
      console.error('Failed to send voice message:', error);
    }
  };

  const handleSmartReplySelect = (reply: string) => {
    setMessageInput(reply);
  };

  const handleSend = async () => {
    if ((!messageInput.trim() && !pendingFile) || sending) return;
    
    setSending(true);
    stopTyping();
    try {
      let content = messageInput.trim();
      
      if (pendingFile) {
        const prefix =
          pendingFile.type === 'image' ? '📷'
          : pendingFile.type === 'video' ? '🎬'
          : pendingFile.type === 'audio' ? '🎤'
          : '📎';
        const line = `${prefix} ${pendingFile.url}`;
        content = content ? `${content}\n${line}` : line;
      }
      
      await sendMessage(content);
      setMessageInput('');
      setPendingFile(null);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Failed to send',
        description: 'Message could not be sent. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    handleTyping();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleClearChat = () => {
    toast({
      title: 'Chat cleared',
      description: 'Local chat view has been cleared',
    });
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    toast({
      title: isMuted ? 'Notifications enabled' : 'Notifications muted',
      description: isMuted ? 'You will receive message notifications' : 'You won\'t receive notifications for this chat',
    });
  };

  const handleViewInfo = () => {
    toast({
      title: activeThread?.type === 'group' ? 'Group Info' : 'Contact Info',
      description: `${activeThread?.name} - ${activeThread?.type === 'group' ? 'Group chat' : 'Private chat'}`,
    });
  };

  const handleReportChat = () => {
    toast({
      title: 'Report submitted',
      description: 'Thank you for your report. We will review it shortly.',
    });
  };

  const handleBackToChats = () => {
    setActiveThread(null);
    setSidebarOpen(true);
  };

  const filteredThreads = threads.filter(thread => 
    thread.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render attachment in message (in-chat preview, no external redirects)
  const renderMessageContent = (content: string) => {
    const parts = content.split('\n');
    return parts.map((part, index) => {
      const trimmed = part.trim();
      if (trimmed.startsWith('📷 ') || trimmed.startsWith('📸 ')) {
        const url = trimmed.replace(/^📷\s+|^📸\s+/, '').trim();
        return (
          <div key={index} className="mt-2">
            <img
              src={url}
              alt="Shared"
              className="max-w-full rounded-lg max-h-64 object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setLightbox({ url, type: 'image' }); }}
            />
          </div>
        );
      } else if (trimmed.startsWith('🎬 ')) {
        const url = trimmed.replace(/^🎬\s+/, '').trim();
        return (
          <div key={index} className="mt-2 relative group">
            <video
              src={url}
              controls
              className="max-w-full rounded-lg max-h-64 cursor-pointer"
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              size="icon" variant="secondary"
              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition"
              onClick={(e) => { e.stopPropagation(); setLightbox({ url, type: 'video' }); }}
              title="Open"
            ><ImageIcon className="h-4 w-4" /></Button>
          </div>
        );
      } else if (trimmed.startsWith('📎 ')) {
        const url = trimmed.replace(/^📎\s+/, '').trim();
        const name = url.split('/').pop() || 'attachment';
        return (
          <button
            key={index}
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              await downloadMedia(url, name);
            }}
            className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors w-full text-left"
          >
            <FileText className="h-4 w-4" />
            <span className="text-xs underline truncate">{name}</span>
          </button>
        );
      } else if (trimmed.startsWith('🎤 ')) {
        const url = trimmed.replace(/^🎤\s+/, '').trim();
        return (
          <div key={index} className="mt-2">
            <VoiceMessage audioUrl={url} />
          </div>
        );
      }
      return <span key={index}>{part}{index < parts.length - 1 && <br />}</span>;
    });
  };

  // Get wallpaper styles
  const getWallpaperClass = () => {
    return WALLPAPER_STYLES[wallpaper] || 'bg-dots';
  };

  const getWallpaperImage = () => {
    return WALLPAPER_IMAGES[wallpaper];
  };

  const wallpaperImage = getWallpaperImage();
  const lastReceivedMessage = messages.filter(m => m.sender_id !== user?.id).pop();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background bg-dots">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
              <MessageCircle className="h-10 w-10 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center border-2 border-background">
              <Sparkles className="h-3 w-3 text-primary-foreground" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-foreground font-semibold text-lg">Loading your chats</p>
            <p className="text-muted-foreground text-sm mt-1">Just a moment...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:relative z-50 lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        w-80 lg:w-[340px] h-full
        transition-transform duration-300 ease-out
        border-r border-border bg-sidebar-background flex flex-col
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-sm">
                <MessageCircle className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-bold text-lg">Messages</h1>
                <p className="text-xs text-muted-foreground">
                  {threads.length} chats • {getOnlineCount()} online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canAccessDashboard && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate('/admin')} 
                  className="h-9 w-9 rounded-lg hover:bg-accent"
                  title="Admin Dashboard"
                >
                  <Shield className="h-4 w-4" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme} 
                className="h-9 w-9 rounded-lg hover:bg-accent"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setSidebarOpen(false)}
                className="h-9 w-9 rounded-lg hover:bg-accent lg:hidden"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Status Stories */}
          <div className="mb-3">
            <StatusStories />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl input-premium"
            />
          </div>
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredThreads.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <MessageCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No conversations found</p>
              </div>
            ) : (
              filteredThreads.map((thread, index) => {
                const isOnline = thread.type === 'admin' 
                  ? isUserOnline(thread.id)
                  : thread.type === 'group' || thread.type === 'ai';
                
                return (
                  <div
                    key={`${thread.type}-${thread.id}`}
                    onClick={() => {
                      isInitialLoad.current = true;
                      setActiveThread(thread);
                      setSidebarOpen(false);
                    }}
                    className={`
                      thread-item p-3 rounded-xl cursor-pointer 
                      hover:bg-accent/50 transition-all duration-200 mb-1
                      ${activeThread?.id === thread.id && activeThread?.type === thread.type ? 'active' : ''}
                      animate-fade-in
                    `}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="avatar-wrapper relative">
                        <Avatar className="h-12 w-12 border-2 border-border">
                          <AvatarFallback className={`font-semibold text-sm ${
                            thread.type === 'ai'
                              ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                              : thread.type === 'group' 
                              ? 'gradient-primary text-primary-foreground' 
                              : 'bg-secondary text-secondary-foreground'
                          }`}>
                            {thread.type === 'ai' ? <Bot className="h-5 w-5" /> :
                             thread.type === 'group' ? <Users className="h-5 w-5" /> : 
                             getInitials(thread.name)}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate text-sm">{thread.name}</span>
                          {thread.type === 'ai' && (
                            <span className="text-xs">🤖</span>
                          )}
                          {thread.lastMessage && (
                            <span className="text-[11px] text-muted-foreground flex-shrink-0">
                              {format(new Date(thread.lastMessage.created_at), 'HH:mm')}
                            </span>
                          )}
                        </div>
                        {thread.type === 'ai' ? (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            Your personal AI assistant
                          </p>
                        ) : thread.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {thread.lastMessage.content.startsWith('📷') ? '📷 Photo' :
                             thread.lastMessage.content.startsWith('🎬') ? '🎬 Video' :
                             thread.lastMessage.content.startsWith('📎') ? '📎 File' :
                             thread.lastMessage.content.startsWith('🎤') ? '🎤 Voice message' :
                             thread.lastMessage.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* User Info */}
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="avatar-wrapper relative">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={userProfile.avatar_url || undefined} />
                  <AvatarFallback className="gradient-primary text-primary-foreground font-semibold text-sm">
                    {userProfile.display_name?.[0]?.toUpperCase() || user?.email?.[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{userProfile.display_name || user?.email}</p>
                {isAdmin && (
                  <span className="text-xs text-primary font-medium flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Admin
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {user && (
                <ProfileSettings
                  user={{ id: user.id, email: user.email || '' }}
                  displayName={userProfile.display_name}
                  avatarUrl={userProfile.avatar_url}
                  onProfileUpdate={refreshProfile}
                />
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={signOut}
                className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Chat Header - Only for non-AI threads */}
        {activeThread?.type !== 'ai' && (
          <div className="h-16 px-4 border-b border-border flex items-center gap-3 bg-card/50 backdrop-blur-sm flex-shrink-0">
            {/* Back button for mobile */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBackToChats} 
              className="h-9 w-9 rounded-lg lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            {/* Menu button for sidebar (desktop) */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSidebarOpen(true)} 
              className="h-9 w-9 rounded-lg hidden lg:flex"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            {activeThread ? (
              <>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="avatar-wrapper relative">
                    <Avatar className="h-10 w-10 border-2 border-border">
                      <AvatarFallback className={`font-semibold text-sm ${
                        activeThread.type === 'group' 
                        ? 'gradient-primary text-primary-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {activeThread.type === 'group' ? <Users className="h-5 w-5" /> : 
                         getInitials(activeThread.name)}
                      </AvatarFallback>
                    </Avatar>
                    {(activeThread.type === 'group' || isUserOnline(activeThread.id)) && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold truncate">{activeThread.name}</h2>
                    <div className="flex items-center gap-1.5">
                      {activeThread.type === 'group' ? (
                        <p className="text-xs text-muted-foreground">
                          {activeThread.isBroadcast ? '📢 Broadcast Channel' : 'Group Chat'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {isUserOnline(activeThread.id) ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Online
                            </>
                          ) : (
                            'Offline'
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex" onClick={handleOpenLiveScreenShare} title="Live Screen Share">
                    <Monitor className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex" onClick={() => setShowScreenCapture(true)}>
                    <ScreenShare className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex" onClick={async () => {
                    if (!activeThread) return;
                    try { await handleStartThreadCall('voice'); }
                    catch (e: any) { toast({ title: 'Call failed', description: e?.message || 'Microphone permission was denied.', variant: 'destructive' }); }
                  }} title="Voice Call">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hidden sm:flex" onClick={async () => {
                    if (!activeThread) return;
                    try { await handleStartThreadCall('video'); }
                    catch (e: any) { toast({ title: 'Call failed', description: e?.message || 'Camera/microphone permission was denied.', variant: 'destructive' }); }
                  }} title="Video Call">
                    <Video className="h-4 w-4" />
                  </Button>
                  
                  {/* Three Dots Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-popover border border-border">
                      <DropdownMenuItem onClick={handleViewInfo}>
                        <Info className="h-4 w-4 mr-2" />
                        {activeThread.type === 'group' ? 'Group info' : 'Contact info'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStartThreadCall('voice').catch((e: any) => toast({ title: 'Call failed', description: e?.message || 'Microphone permission was denied.', variant: 'destructive' }))}>
                        <Phone className="h-4 w-4 mr-2" />
                        Voice call
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStartThreadCall('video').catch((e: any) => toast({ title: 'Call failed', description: e?.message || 'Camera/microphone permission was denied.', variant: 'destructive' }))}>
                        <Video className="h-4 w-4 mr-2" />
                        Video call
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleMuteToggle}>
                        {isMuted ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
                        {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWallpaperOpen(true)}>
                        <Palette className="h-4 w-4 mr-2" />
                        Wallpaper
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowScreenCapture(true)}>
                        <ScreenShare className="h-4 w-4 mr-2" />
                        Screen Capture
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Search className="h-4 w-4 mr-2" />
                        Search in chat
                      </DropdownMenuItem>
                      {activeThread.type === 'group' && (
                        <DropdownMenuItem>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add participants
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleClearChat}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear chat
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleReportChat} className="text-destructive">
                        <Flag className="h-4 w-4 mr-2" />
                        Report
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Select a conversation</p>
            )}
          </div>
        )}

        {/* Messages with wallpaper OR AI Chat Thread */}
        {activeThread?.type === 'ai' ? (
          <AIChatThread className="flex-1 min-h-0" onBack={handleBackToChats} />
        ) : (
          <div 
            className={cn("flex-1 relative min-h-0 overflow-hidden", getWallpaperClass())}
            style={wallpaperImage ? { 
              backgroundImage: `url(${wallpaperImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            } : undefined}
          >
            {wallpaperImage && <div className="absolute inset-0 bg-black/30" />}
            
            <ScrollArea className="h-full relative z-10">
              <div className="p-4 lg:p-6">
                {activeThread ? (
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {messages.map((msg, index) => {
                      const isMine = msg.sender_id === user?.id;
                      const showAvatar = !isMine && (index === 0 || messages[index - 1]?.sender_id !== msg.sender_id);
                      const showName = !isMine && activeThread.type === 'group' && showAvatar;
                      
                      return (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          isMine={isMine}
                          showAvatar={showAvatar}
                          showName={showName}
                          getInitials={getInitials}
                          renderMessageContent={renderMessageContent}
                          activeThread={activeThread}
                        />
                      );
                    })}
                    
                    {typingUsers.length > 0 && (
                      <div className="flex items-center gap-2 animate-fade-in">
                        <Avatar className="h-8 w-8 border border-border">
                          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
                            {getInitials(typingUsers[0]?.display_name || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card border border-border">
                          <div className="typing-indicator">
                            <span></span><span></span><span></span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {typingUsers.map(u => u.display_name).join(', ')} typing...
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center min-h-[60vh]">
                    <div className="text-center animate-fade-in">
                      <div className="h-24 w-24 rounded-2xl gradient-primary-soft flex items-center justify-center mx-auto mb-6 shadow-soft">
                        <MessageCircle className="h-12 w-12 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Welcome to AstraChat</h3>
                      <p className="text-muted-foreground max-w-sm">
                        Select a conversation from the sidebar to start messaging
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Message Input - Only for non-AI threads */}
        {activeThread && activeThread.type !== 'ai' && (
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
            {activeThread.isBroadcast && !isAdmin ? (
              <div className="text-center text-muted-foreground py-2 text-sm">
                📢 This is a broadcast channel. Only admins can send messages.
              </div>
            ) : isRecordingVoice ? (
              <div className="max-w-3xl mx-auto">
                <VoiceRecorder
                  onSend={handleVoiceSend}
                  onCancel={() => setIsRecordingVoice(false)}
                />
              </div>
            ) : (
              <>
                {/* Smart Replies */}
                {lastReceivedMessage && (
                  <div className="max-w-3xl mx-auto mb-2">
                    <SmartReplies
                      lastMessage={lastReceivedMessage.content}
                      onSelectReply={handleSmartReplySelect}
                    />
                  </div>
                )}
                
                {/* File Preview */}
                {pendingFile && (
                  <div className="mb-2 p-2 bg-muted rounded-lg flex items-center gap-2 max-w-3xl mx-auto">
                    {pendingFile.type === 'image' ? (
                      <ImageIcon className="h-4 w-4 text-primary" />
                    ) : (
                      <FileText className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-xs flex-1 truncate">File ready to send</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6" 
                      onClick={() => setPendingFile(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                <div className="flex gap-2 max-w-3xl mx-auto items-center">
                  <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                  {user && (
                    <FileUpload userId={user.id} onFileUploaded={handleFileUploaded} />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl hover:bg-accent"
                    onClick={() => setIsRecordingVoice(true)}
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                  <Input
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="flex-1 h-12 px-4 rounded-xl input-premium text-sm"
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend} 
                    disabled={(!messageInput.trim() && !pendingFile) || sending}
                    className="h-12 w-12 rounded-xl btn-send"
                    size="icon"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* AI Assistant */}
      <AIAssistant />

      {/* Wallpaper Picker Dialog */}
      <WallpaperPickerDialog
        isOpen={wallpaperOpen}
        onOpenChange={setWallpaperOpen}
        currentWallpaper={wallpaper}
        onSelectWallpaper={saveWallpaper}
      />

      {/* Screen Capture Dialog */}
      <ScreenCapture
        isOpen={showScreenCapture}
        onClose={() => setShowScreenCapture(false)}
        onCaptureSend={(url, type) => {
          const content = type === 'screenshot' ? `📸 ${url}` : `🎬 ${url}`;
          sendMessage(content);
          setShowScreenCapture(false);
        }}
        recipientName={activeThread?.name}
      />

      {/* Live Screen Share */}
      <LiveScreenShare
        isOpen={showScreenShare}
        onClose={() => { setShowScreenShare(false); setScreenShareTarget(null); }}
        receiverId={screenShareTarget?.id}
        receiverName={screenShareTarget?.name}
      />

      {/* Screen Share Viewer for incoming requests */}
      <ScreenShareViewer />

      {/* Call UI - Incoming call */}
      {callManager.isReceivingCall && callManager.incomingCall && (
        <IncomingCallScreen
          callerName={callManager.callerName || 'Unknown'}
          callType={(callManager.incomingCall.call_type as 'voice' | 'video') || 'voice'}
          onAccept={() => callManager.acceptCall(callManager.incomingCall!.id, (callManager.incomingCall!.call_type as 'voice' | 'video') || 'voice')}
          onReject={() => callManager.rejectCall(callManager.incomingCall!.id)}
        />
      )}

      {/* Call UI - Outgoing call (ringing) */}
      {callManager.isCalling && !callManager.isInCall && (
        <OutgoingCallScreen
          receiverName={activeThread?.name || 'User'}
          callType={callManager.callType || 'voice'}
          onCancel={callManager.endCall}
        />
      )}

      {/* Active call — unified Zoom-class Stage with AI */}
      {callManager.isInCall && (
        <CallStage
          callType={callManager.callType || 'voice'}
          callId={callManager.callId}
          localStream={callManager.localStream}
          remoteStream={callManager.remoteStream}
          localScreenStream={callManager.localScreenStream}
          remoteScreenStream={callManager.remoteScreenStream}
          isMuted={callManager.isMuted}
          isCameraOff={callManager.isCameraOff}
          isSharingScreen={callManager.isSharingScreen}
          callDuration={callManager.callDuration}
          formatDuration={callManager.formatDuration}
          peerName={activeThread?.name || 'User'}
          rttMs={callManager.rttMs}
          onToggleMute={callManager.toggleMute}
          onToggleCamera={callManager.toggleCamera}
          onStartShare={async () => {
            try { await callManager.startScreenShare(); }
            catch (err: any) {
              const msg = err?.name === 'NotAllowedError'
                ? 'Screen share was blocked. Allow screen recording for this site and try again.'
                : err?.message || 'Screen sharing is not available in this browser/preview. Open the published app at astrachat.lovable.app in Chrome or Edge.';
              toast({ title: 'Screen share unavailable', description: msg, variant: 'destructive' });
            }
          }}
          onStopShare={callManager.stopScreenShare}
          onEndCall={callManager.endCall}
        />
      )}

      {lightbox && (
        <MediaLightbox
          url={lightbox.url}
          type={lightbox.type}
          open={!!lightbox}
          onClose={() => setLightbox(null)}
          onResend={(url, type) => {
            const prefix = type === 'image' ? '📷' : '🎬';
            sendMessage(`${prefix} ${url}`);
          }}
        />
      )}
    </div>
  );
}
