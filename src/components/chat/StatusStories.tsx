import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Camera, Type, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface Status {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  expires_at: string;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    email: string;
  };
}

export function StatusStories() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [myStatus, setMyStatus] = useState<Status[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentViewStatus, setCurrentViewStatus] = useState<Status[]>([]);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);

  useEffect(() => {
    fetchStatuses();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('status-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_status',
        },
        () => fetchStatuses()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchStatuses = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_status')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      // Get user profiles
      const userIds = [...new Set(data.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const statusesWithUsers = data.map(s => ({
        ...s,
        user: profileMap.get(s.user_id),
      }));

      setMyStatus(statusesWithUsers.filter(s => s.user_id === user.id));
      setStatuses(statusesWithUsers.filter(s => s.user_id !== user.id));
    }
  };

  const viewStatus = (userId: string) => {
    const userStatuses = [...myStatus, ...statuses].filter(s => s.user_id === userId);
    if (userStatuses.length > 0) {
      setCurrentViewStatus(userStatuses);
      setCurrentViewIndex(0);
      setIsViewerOpen(true);
    }
  };

  const deleteMyStatus = async (statusId: string) => {
    await supabase.from('user_status').delete().eq('id', statusId);
    fetchStatuses();
  };

  // Group statuses by user
  const groupedStatuses = statuses.reduce((acc, status) => {
    if (!acc[status.user_id]) {
      acc[status.user_id] = [];
    }
    acc[status.user_id].push(status);
    return acc;
  }, {} as Record<string, Status[]>);

  return (
    <>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 pb-2 px-1">
          {/* My Status / Add Status */}
          <button
            onClick={() => myStatus.length > 0 ? viewStatus(user!.id) : setIsCreateOpen(true)}
            className="flex flex-col items-center gap-1 min-w-[60px]"
          >
            <div className={cn(
              "relative w-14 h-14 rounded-full flex items-center justify-center",
              myStatus.length > 0 
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                : "border-2 border-dashed border-muted-foreground/30"
            )}>
              {myStatus.length > 0 ? (
                <Avatar className="h-12 w-12">
                  <AvatarImage src={myStatus[0].user?.avatar_url || undefined} />
                  <AvatarFallback className="gradient-primary text-white">
                    {myStatus[0].user?.display_name?.[0] || myStatus[0].user?.email[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Plus className="h-6 w-6 text-muted-foreground" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreateOpen(true);
                }}
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">My Status</span>
          </button>

          {/* Other Users' Statuses */}
          {Object.entries(groupedStatuses).map(([userId, userStatuses]) => (
            <button
              key={userId}
              onClick={() => viewStatus(userId)}
              className="flex flex-col items-center gap-1 min-w-[60px]"
            >
              <div className="relative w-14 h-14 rounded-full ring-2 ring-primary ring-offset-2 ring-offset-background">
                <Avatar className="h-12 w-12 mx-auto">
                  <AvatarImage src={userStatuses[0].user?.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted">
                    {userStatuses[0].user?.display_name?.[0] || userStatuses[0].user?.email[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                {userStatuses[0].user?.display_name || userStatuses[0].user?.email.split('@')[0]}
              </span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Create Status Dialog */}
      <CreateStatusDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={fetchStatuses}
      />

      {/* Status Viewer Dialog */}
      <StatusViewerDialog
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        statuses={currentViewStatus}
        currentIndex={currentViewIndex}
        onIndexChange={setCurrentViewIndex}
        onDelete={myStatus.some(s => currentViewStatus.includes(s)) ? deleteMyStatus : undefined}
      />
    </>
  );
}

interface CreateStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateStatusDialog({ isOpen, onClose, onCreated }: CreateStatusDialogProps) {
  const { user } = useAuth();
  const [type, setType] = useState<'text' | 'image'>('text');
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = async () => {
    if (!user || !content.trim()) return;

    await supabase.from('user_status').insert({
      user_id: user.id,
      content: content.trim(),
    });

    setContent('');
    onCreated();
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.length) return;

    setIsUploading(true);
    const file = e.target.files[0];

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { data: uploadData, error } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (!error && uploadData) {
      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(uploadData.path);

      await supabase.from('user_status').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
      });

      onCreated();
      onClose();
    }

    setIsUploading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Status</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={type === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('text')}
            className="flex-1"
          >
            <Type className="h-4 w-4 mr-2" />
            Text
          </Button>
          <Button
            variant={type === 'image' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('image')}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Photo
          </Button>
        </div>

        {type === 'text' ? (
          <div className="space-y-3">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="min-h-[100px]"
              maxLength={500}
            />
            <Button onClick={handleTextSubmit} className="w-full" disabled={!content.trim()}>
              Share Status
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-24"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <span>Uploading...</span>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Camera className="h-8 w-8" />
                  <span className="text-sm">Choose Photo or Video</span>
                </div>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface StatusViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  statuses: Status[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onDelete?: (id: string) => void;
}

function StatusViewerDialog({
  isOpen,
  onClose,
  statuses,
  currentIndex,
  onIndexChange,
  onDelete,
}: StatusViewerDialogProps) {
  const currentStatus = statuses[currentIndex];

  useEffect(() => {
    if (!isOpen || !currentStatus) return;

    // Auto-advance after 5 seconds
    const timer = setTimeout(() => {
      if (currentIndex < statuses.length - 1) {
        onIndexChange(currentIndex + 1);
      } else {
        onClose();
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isOpen, currentIndex, statuses.length, onIndexChange, onClose, currentStatus]);

  if (!currentStatus) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-black">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
          {statuses.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "h-0.5 flex-1 rounded-full",
                idx < currentIndex ? "bg-white" : idx === currentIndex ? "bg-white/60" : "bg-white/30"
              )}
            />
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-0 right-0 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border-2 border-white">
              <AvatarImage src={currentStatus.user?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-white text-xs">
                {currentStatus.user?.display_name?.[0] || currentStatus.user?.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-white">
              <p className="text-sm font-medium">
                {currentStatus.user?.display_name || currentStatus.user?.email.split('@')[0]}
              </p>
              <p className="text-xs opacity-70">
                {new Date(currentStatus.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => {
                  onDelete(currentStatus.id);
                  if (statuses.length <= 1) {
                    onClose();
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div
          className="h-[70vh] flex items-center justify-center"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            
            if (clickX < rect.width / 2) {
              // Left half - go back
              if (currentIndex > 0) onIndexChange(currentIndex - 1);
            } else {
              // Right half - go forward
              if (currentIndex < statuses.length - 1) {
                onIndexChange(currentIndex + 1);
              } else {
                onClose();
              }
            }
          }}
        >
          {currentStatus.media_url ? (
            currentStatus.media_type === 'video' ? (
              <video
                src={currentStatus.media_url}
                className="max-h-full max-w-full object-contain"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <img
                src={currentStatus.media_url}
                alt="Status"
                className="max-h-full max-w-full object-contain"
              />
            )
          ) : (
            <div className="p-8 text-center">
              <p className="text-white text-xl font-medium">{currentStatus.content}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
