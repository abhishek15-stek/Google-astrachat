import { useState, useEffect } from 'react';
import { Group, User, GroupMember } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, Trash2, UserPlus, UserMinus, Search, X } from 'lucide-react';
import { format } from 'date-fns';

interface GroupManagementProps {
  groups: Group[];
  users: User[];
  onCreateGroup: (name: string, description: string, memberIds: string[]) => Promise<unknown>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onGetMembers: (groupId: string) => Promise<GroupMember[]>;
  onAddMember: (groupId: string, userId: string) => Promise<void>;
  onRemoveMember: (groupId: string, userId: string) => Promise<void>;
  onRefresh: () => void;
  canManage?: boolean;
}

export function GroupManagement({
  groups,
  users,
  onCreateGroup,
  onDeleteGroup,
  onGetMembers,
  onAddMember,
  onRemoveMember,
  onRefresh,
  canManage = false,
}: GroupManagementProps) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Create group form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Include all users (including admin) in the list
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (user.display_name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ?? false)
  );

  const nonMemberUsers = users.filter(user => 
    !groupMembers.some(m => m.user_id === user.id) &&
    (user.email.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
    (user.display_name?.toLowerCase().includes(memberSearchQuery.toLowerCase()) ?? false))
  );

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast({ title: 'Error', description: 'Group name is required', variant: 'destructive' });
      return;
    }

    try {
      await onCreateGroup(newGroupName, newGroupDescription, selectedUserIds);
      toast({ title: 'Success', description: 'Group created successfully' });
      setCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create group', variant: 'destructive' });
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Are you sure you want to delete "${group.name}"?`)) return;

    try {
      await onDeleteGroup(group.id);
      toast({ title: 'Success', description: 'Group deleted successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete group', variant: 'destructive' });
    }
  };

  const handleViewMembers = async (group: Group) => {
    setSelectedGroup(group);
    const members = await onGetMembers(group.id);
    setGroupMembers(members);
    setMembersDialogOpen(true);
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedGroup) return;

    try {
      await onAddMember(selectedGroup.id, userId);
      const members = await onGetMembers(selectedGroup.id);
      setGroupMembers(members);
      toast({ title: 'Success', description: 'Member added successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add member', variant: 'destructive' });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;

    try {
      await onRemoveMember(selectedGroup.id, userId);
      const members = await onGetMembers(selectedGroup.id);
      setGroupMembers(members);
      toast({ title: 'Success', description: 'Member removed successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove member', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setNewGroupName('');
    setNewGroupDescription('');
    setSelectedUserIds([]);
    setUserSearchQuery('');
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {canManage && <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="group-name">Group Name *</Label>
                <Input
                  id="group-name"
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-description">Description</Label>
                <Textarea
                  id="group-description"
                  placeholder="Enter group description..."
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Select Members ({selectedUserIds.length} selected)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <ScrollArea className="h-48 border rounded-lg p-2">
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer"
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.display_name || 'No Name'}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <Button onClick={handleCreateGroup} className="w-full">
                Create Group
              </Button>
            </div>
          </DialogContent>
        </Dialog>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold">{groups.length}</p>
          <p className="text-sm text-muted-foreground">Total Groups</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold">{groups.reduce((sum, g) => sum + g.member_count, 0)}</p>
          <p className="text-sm text-muted-foreground">Total Memberships</p>
        </div>
      </div>

      {/* Group List */}
      <ScrollArea className="h-[400px] border rounded-lg">
        <div className="divide-y divide-border">
          {filteredGroups.map((group) => (
            <div key={group.id} className="p-4 hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{group.name}</span>
                      <Badge variant="secondary">{group.member_count} members</Badge>
                    </div>
                    {group.description && (
                      <p className="text-sm text-muted-foreground truncate">{group.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {format(new Date(group.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewMembers(group)}
                    className="gap-1"
                  >
                    <UserPlus className="h-4 w-4" />
                    {canManage ? 'Manage' : 'View'}
                  </Button>
                  {canManage && <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteGroup(group)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>}
                </div>
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No groups found</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Members - {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Current Members */}
            <div className="space-y-2">
              <Label>Current Members ({groupMembers.length})</Label>
              <ScrollArea className="h-40 border rounded-lg p-2">
                <div className="space-y-2">
                  {groupMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.user?.display_name || member.user?.email || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined: {format(new Date(member.joined_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {canManage && <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>}
                    </div>
                  ))}
                  {groupMembers.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No members yet</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Add Members */}
            {canManage && <div className="space-y-2">
              <Label>Add Members</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users to add..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ScrollArea className="h-40 border rounded-lg p-2">
                <div className="space-y-2">
                  {nonMemberUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.display_name || 'No Name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleAddMember(user.id)}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {nonMemberUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No users available to add</p>
                  )}
                </div>
              </ScrollArea>
            </div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
