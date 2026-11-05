import { useState } from 'react';
import { User, AppRole } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Shield, 
  User as UserIcon, 
  Clock, 
  Ban, 
  CheckCircle,
  Download,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserManagementProps {
  users: User[];
  onRefresh: () => void;
  onBanUser: (userId: string, isBanned: boolean) => Promise<void>;
  onExport: (data: object[], filename: string) => void;
  canModerate?: boolean;
}

export function UserManagement({ users, onRefresh, onBanUser, onExport, canModerate = false }: UserManagementProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'banned'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesFilter = filterStatus === 'all' || 
      (filterStatus === 'banned' && user.is_banned) ||
      (filterStatus === 'active' && !user.is_banned);
    
    return matchesSearch && matchesFilter;
  });

  const handleBanToggle = async (user: User) => {
    const action = user.is_banned ? 'unban' : 'ban';
    if (!confirm(`Are you sure you want to ${action} ${user.display_name || user.email}?`)) return;

    setActionLoading(user.id);
    try {
      await onBanUser(user.id, !user.is_banned);
      toast({ 
        title: 'Success', 
        description: `User ${action === 'ban' ? 'banned' : 'unbanned'} successfully` 
      });
    } catch {
      toast({ title: 'Error', description: `Failed to ${action} user`, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = () => {
    const exportData = filteredUsers.map(u => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name || '',
      role: u.role,
      status: u.is_banned ? 'banned' : 'active',
      created_at: u.created_at,
      last_active: u.last_active || '',
    }));
    onExport(exportData, 'users');
    toast({ title: 'Exported', description: 'User data exported to CSV' });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const bannedCount = users.filter(u => u.is_banned).length;
  const adminCount = users.filter(u => u.role === 'admin' || u.role === 'sub_admin').length;

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              {filterStatus === 'all' ? 'All' : filterStatus === 'banned' ? 'Banned' : 'Active'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterStatus('all')}>All Users</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus('active')}>Active Only</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus('banned')}>Banned Only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-2xl font-bold text-primary">{adminCount}</p>
          <p className="text-sm text-muted-foreground">Admins</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-2xl font-bold text-green-500">{users.length - adminCount - bannedCount}</p>
          <p className="text-sm text-muted-foreground">Regular Users</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-2xl font-bold text-destructive">{bannedCount}</p>
          <p className="text-sm text-muted-foreground">Banned</p>
        </div>
      </div>

      {/* User List */}
      <ScrollArea className="h-[400px] border rounded-xl">
        <div className="divide-y divide-border">
          {filteredUsers.map((user) => (
            <div 
              key={user.id} 
              className={`p-4 hover:bg-accent/50 transition-colors ${user.is_banned ? 'opacity-60 bg-destructive/5' : ''}`}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className={
                    user.role === 'admin' 
                      ? 'bg-primary text-primary-foreground' 
                      : user.is_banned 
                        ? 'bg-destructive/20 text-destructive'
                        : 'bg-secondary'
                  }>
                    {user.role === 'admin' ? <Shield className="h-5 w-5" /> : getInitials(user.display_name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{user.display_name || 'No Name'}</span>
                    <Badge variant={
                      user.role === 'admin' ? 'default' : 
                      user.role === 'sub_admin' ? 'default' :
                      user.role === 'senior_member' ? 'default' :
                      user.role === 'member' ? 'default' :
                      user.role === 'spectator' ? 'outline' : 'secondary'
                    } className={
                      user.role === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      user.role === 'sub_admin' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      user.role === 'senior_member' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                      user.role === 'member' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      user.role === 'spectator' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : ''
                    }>
                      {user.role === 'sub_admin' ? 'Sub Admin' :
                       user.role === 'senior_member' ? 'Senior' :
                       user.role}
                    </Badge>
                    {user.is_banned && (
                      <Badge variant="destructive" className="gap-1">
                        <Ban className="h-3 w-3" /> Banned
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Joined: {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </span>
                    {user.last_active && (
                      <span>Last active: {format(new Date(user.last_active), 'MMM d, HH:mm')}</span>
                    )}
                  </div>
                </div>
                {canModerate && user.role !== 'admin' && (
                  <Button
                    variant={user.is_banned ? 'outline' : 'destructive'}
                    size="sm"
                    onClick={() => handleBanToggle(user)}
                    disabled={actionLoading === user.id}
                    className="gap-2"
                  >
                    {actionLoading === user.id ? (
                      <span className="h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
                    ) : user.is_banned ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Unban
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" />
                        Ban
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <UserIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
