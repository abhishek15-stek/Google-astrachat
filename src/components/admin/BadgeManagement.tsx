import { useState } from 'react';
import { User } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  Shield,
  ShieldCheck,
  Crown,
  Star,
  User as UserIcon,
  Eye,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BadgeManagementProps {
  users: User[];
  onRefresh: () => void;
}

type AppRole = 'admin' | 'sub_admin' | 'senior_member' | 'member' | 'user' | 'spectator';

const ROLE_CONFIG: Record<AppRole, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  admin: {
    label: 'Admin',
    icon: <Shield className="h-3.5 w-3.5" />,
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    description: 'Full control over everything',
  },
  sub_admin: {
    label: 'Sub Admin',
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    description: 'Dashboard access, manage chats & groups, normal AI',
  },
  senior_member: {
    label: 'Senior Member',
    icon: <Crown className="h-3.5 w-3.5" />,
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    description: 'Message all users, view all groups, read-only dashboard',
  },
  member: {
    label: 'Member',
    icon: <Star className="h-3.5 w-3.5" />,
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    description: 'Access to all user chats, message anyone',
  },
  user: {
    label: 'User',
    icon: <UserIcon className="h-3.5 w-3.5" />,
    color: 'bg-muted text-muted-foreground border-border',
    description: 'Standard user, groups & admin chat only',
  },
  spectator: {
    label: 'Spectator',
    icon: <Eye className="h-3.5 w-3.5" />,
    color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    description: 'View only — cannot message, use AI, or interact',
  },
};

const ASSIGNABLE_ROLES: AppRole[] = ['sub_admin', 'senior_member', 'member', 'user', 'spectator'];

export function BadgeManagement({ users, onRefresh }: BadgeManagementProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setLoading(userId);
    try {
      const { error } = await (supabase as any).rpc('set_user_role', {
        _target_user_id: userId,
        _role: newRole,
      });

      if (error) throw error;
      toast({ title: 'Role Updated', description: `User role changed to ${ROLE_CONFIG[newRole].label}` });
      onRefresh();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update role', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const roleCounts = Object.fromEntries(
    Object.keys(ROLE_CONFIG).map(role => [
      role,
      users.filter(u => u.role === role).length,
    ])
  );

  return (
    <div className="space-y-4">
      {/* Role Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Object.entries(ROLE_CONFIG).map(([role, config]) => (
          <div key={role} className="bg-card rounded-xl p-3 border border-border text-center">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${config.color} mb-1`}>
              {config.icon}
              {config.label}
            </div>
            <p className="text-lg font-bold">{roleCounts[role] || 0}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-1">{config.description}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users to assign badges..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* User List */}
      <ScrollArea className="h-[400px] border rounded-xl">
        <div className="divide-y divide-border">
          {filteredUsers.map((user) => {
            const userRole = (user.role || 'user') as AppRole;
            const roleConfig = ROLE_CONFIG[userRole] || ROLE_CONFIG.user;

            return (
              <div key={user.id} className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.display_name || user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate text-sm">
                        {user.display_name || 'No Name'}
                      </span>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${roleConfig.color}`}>
                        {roleConfig.icon}
                        {roleConfig.label}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {userRole !== 'admin' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          disabled={loading === user.id}
                        >
                          {loading === user.id ? (
                            <span className="h-3.5 w-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              Change Role
                              <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {ASSIGNABLE_ROLES.map((role) => {
                          const config = ROLE_CONFIG[role];
                          return (
                            <DropdownMenuItem
                              key={role}
                              onClick={() => handleRoleChange(user.id, role)}
                              className="gap-2"
                              disabled={userRole === role}
                            >
                              <span className={`inline-flex items-center gap-1 ${userRole === role ? 'opacity-50' : ''}`}>
                                {config.icon}
                                {config.label}
                              </span>
                              {userRole === role && (
                                <span className="text-[10px] text-muted-foreground ml-auto">current</span>
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
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
