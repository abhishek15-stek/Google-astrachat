import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Trash2, MessageSquareX, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { User, Group } from '@/hooks/useAdmin';

interface AdminActionsProps {
  users: User[];
  groups: Group[];
  onRefresh: () => void;
}

export function AdminActions({ users, groups, onRefresh }: AdminActionsProps) {
  const { toast } = useToast();
  const [deleteAllChatsOpen, setDeleteAllChatsOpen] = useState(false);
  const [deleteAllGroupsOpen, setDeleteAllGroupsOpen] = useState(false);
  const [deleteUserChatsOpen, setDeleteUserChatsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDeleteAllChats = async () => {
    if (confirmText !== 'DELETE ALL') return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      toast({
        title: 'All chats deleted',
        description: 'All messages have been permanently removed',
      });
      setDeleteAllChatsOpen(false);
      setConfirmText('');
      onRefresh();
    } catch (error) {
      console.error('Error deleting chats:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete all chats',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllGroups = async () => {
    if (confirmText !== 'DELETE ALL') return;
    
    setLoading(true);
    try {
      // First delete all group members
      const { error: membersError } = await supabase
        .from('group_members')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (membersError) throw membersError;

      // Delete all group messages
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('receiver_type', 'group');

      if (messagesError) throw messagesError;

      // Delete all groups
      const { error: groupsError } = await supabase
        .from('groups')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (groupsError) throw groupsError;

      toast({
        title: 'All groups deleted',
        description: 'All groups and their messages have been permanently removed',
      });
      setDeleteAllGroupsOpen(false);
      setConfirmText('');
      onRefresh();
    } catch (error) {
      console.error('Error deleting groups:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete all groups',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUserChats = async () => {
    if (!selectedUserId) return;
    
    setLoading(true);
    try {
      // Delete messages sent by this user
      const { error: sentError } = await supabase
        .from('messages')
        .delete()
        .eq('sender_id', selectedUserId);

      if (sentError) throw sentError;

      // Delete admin chat messages for this user
      const { error: adminError } = await supabase
        .from('messages')
        .delete()
        .eq('receiver_type', 'admin')
        .eq('receiver_id', selectedUserId);

      if (adminError) throw adminError;

      const userName = users.find(u => u.id === selectedUserId)?.display_name || 'User';
      toast({
        title: 'User chats deleted',
        description: `All messages for ${userName} have been deleted`,
      });
      setDeleteUserChatsOpen(false);
      setSelectedUserId('');
      onRefresh();
    } catch (error) {
      console.error('Error deleting user chats:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user chats',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* Delete All Chats */}
      <Dialog open={deleteAllChatsOpen} onOpenChange={setDeleteAllChatsOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2">
            <MessageSquareX className="h-4 w-4" />
            Delete All Chats
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete All Chats
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All messages will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-bold text-foreground">DELETE ALL</span> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE ALL"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllChatsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllChats}
              disabled={confirmText !== 'DELETE ALL' || loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Groups */}
      <Dialog open={deleteAllGroupsOpen} onOpenChange={setDeleteAllGroupsOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Delete All Groups
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete All Groups
            </DialogTitle>
            <DialogDescription>
              This will delete all groups, their members, and group messages permanently.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-bold text-foreground">DELETE ALL</span> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE ALL"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllGroupsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllGroups}
              disabled={confirmText !== 'DELETE ALL' || loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User's Chats */}
      <Dialog open={deleteUserChatsOpen} onOpenChange={setDeleteUserChatsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete User Chats
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User's Chats</DialogTitle>
            <DialogDescription>
              Select a user to delete all their messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role !== 'admin').map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.display_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserChatsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUserChats}
              disabled={!selectedUserId || loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Chats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
