import { useState } from 'react';
import { Announcement, Group } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Megaphone, 
  Trash2, 
  Clock,
  Users,
  Globe,
  User
} from 'lucide-react';
import { format } from 'date-fns';

interface AnnouncementsProps {
  announcements: Announcement[];
  groups: Group[];
  onCreateAnnouncement: (
    title: string,
    content: string,
    targetType?: 'all' | 'group' | 'user',
    targetId?: string,
    expiresAt?: string
  ) => Promise<void>;
  onDeleteAnnouncement: (id: string) => Promise<void>;
  onToggleActive: (id: string, isActive: boolean) => Promise<void>;
  onRefresh: () => void;
}

export function Announcements({
  announcements,
  groups,
  onCreateAnnouncement,
  onDeleteAnnouncement,
  onToggleActive,
  onRefresh,
}: AnnouncementsProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'group'>('all');
  const [targetId, setTargetId] = useState<string>('');
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ title: 'Error', description: 'Title and content are required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      let expiresAt: string | undefined;
      if (expiresIn !== 'never') {
        const date = new Date();
        date.setHours(date.getHours() + parseInt(expiresIn));
        expiresAt = date.toISOString();
      }

      await onCreateAnnouncement(
        title,
        content,
        targetType,
        targetType === 'group' ? targetId : undefined,
        expiresAt
      );

      toast({ title: 'Success', description: 'Announcement created successfully' });
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create announcement', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      await onDeleteAnnouncement(id);
      toast({ title: 'Success', description: 'Announcement deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete announcement', variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await onToggleActive(id, isActive);
    } catch {
      toast({ title: 'Error', description: 'Failed to update announcement', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTargetType('all');
    setTargetId('');
    setExpiresIn('never');
  };

  const activeCount = announcements.filter(a => a.is_active).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold">{announcements.length}</p>
            <p className="text-sm text-muted-foreground">Total Announcements</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-green-500">{activeCount}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                Create Announcement
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  placeholder="Announcement title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Message *</Label>
                <Textarea
                  placeholder="Write your announcement..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Select value={targetType} onValueChange={(v) => setTargetType(v as 'all' | 'group')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="group">Specific Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {targetType === 'group' && (
                  <div className="space-y-2">
                    <Label>Select Group</Label>
                    <Select value={targetId} onValueChange={setTargetId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Auto-expire after</Label>
                <Select value={expiresIn} onValueChange={setExpiresIn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Never (manual control)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="168">1 week</SelectItem>
                    <SelectItem value="720">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleCreate} 
                className="w-full gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Broadcast Announcement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Announcements List */}
      <ScrollArea className="h-[400px] border rounded-xl">
        <div className="divide-y divide-border">
          {announcements.map((announcement) => (
            <div 
              key={announcement.id} 
              className={`p-4 hover:bg-accent/50 transition-colors ${!announcement.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold">{announcement.title}</span>
                    <Badge variant={announcement.is_active ? 'default' : 'secondary'}>
                      {announcement.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      {announcement.target_type === 'all' ? (
                        <><Globe className="h-3 w-3" /> All Users</>
                      ) : announcement.target_type === 'group' ? (
                        <><Users className="h-3 w-3" /> Group</>
                      ) : (
                        <><User className="h-3 w-3" /> User</>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{announcement.content}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(announcement.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                    {announcement.expires_at && (
                      <span className="text-orange-500">
                        Expires: {format(new Date(announcement.expires_at), 'MMM d, HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${announcement.id}`} className="text-xs">Active</Label>
                    <Switch
                      id={`active-${announcement.id}`}
                      checked={announcement.is_active}
                      onCheckedChange={(checked) => handleToggle(announcement.id, checked)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(announcement.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No announcements yet</p>
              <p className="text-sm">Create one to broadcast to your users</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
