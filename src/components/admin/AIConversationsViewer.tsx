import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, Search, RefreshCw, User, Download, MessageCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AIConversation {
  id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
  user?: {
    display_name: string | null;
    email: string;
  };
}

interface UserWithConversations {
  userId: string;
  displayName: string;
  email: string;
  messageCount: number;
  lastActive: string;
}

export function AIConversationsViewer() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [users, setUsers] = useState<UserWithConversations[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterRole, setFilterRole] = useState<string>('all');

  useEffect(() => {
    fetchUsersWithConversations();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchUserConversations(selectedUserId);
    }
  }, [selectedUserId]);

  const fetchUsersWithConversations = async () => {
    setLoading(true);
    try {
      // Get all AI conversations with user profiles
      const { data: convos, error } = await supabase
        .from('ai_conversations')
        .select('user_id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by user
      const userMap = new Map<string, { count: number; lastActive: string }>();
      convos?.forEach(c => {
        const existing = userMap.get(c.user_id);
        if (!existing) {
          userMap.set(c.user_id, { count: 1, lastActive: c.created_at });
        } else {
          userMap.set(c.user_id, { count: existing.count + 1, lastActive: existing.lastActive });
        }
      });

      // Fetch user profiles
      const userIds = Array.from(userMap.keys());
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', userIds);

        const usersWithConvos: UserWithConversations[] = [];
        profiles?.forEach(p => {
          const data = userMap.get(p.id);
          if (data) {
            usersWithConvos.push({
              userId: p.id,
              displayName: p.display_name || 'Unknown',
              email: p.email,
              messageCount: data.count,
              lastActive: data.lastActive,
            });
          }
        });

        // Sort by message count
        usersWithConvos.sort((a, b) => b.messageCount - a.messageCount);
        setUsers(usersWithConvos);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserConversations = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', userId)
        .maybeSingle();

      const convosWithUser = data?.map(c => ({
        ...c,
        user: profile || undefined,
      })) || [];

      setConversations(convosWithUser);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportConversations = () => {
    if (conversations.length === 0) return;

    const csv = [
      ['Timestamp', 'Role', 'Message'].join(','),
      ...conversations.map(c => [
        format(new Date(c.created_at), 'yyyy-MM-dd HH:mm:ss'),
        c.role,
        `"${c.content.replace(/"/g, '""')}"`,
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${selectedUserId}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || c.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
          <p className="text-sm text-muted-foreground">Users with AI Chats</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <p className="text-2xl font-bold">{users.reduce((sum, u) => sum + u.messageCount, 0)}</p>
          </div>
          <p className="text-sm text-muted-foreground">Total AI Messages</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-green-500" />
            <p className="text-2xl font-bold">{conversations.filter(c => c.role === 'assistant').length}</p>
          </div>
          <p className="text-sm text-muted-foreground">AI Responses (Selected)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchUsersWithConversations} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <ScrollArea className="h-[500px] border rounded-lg">
            <div className="p-2 space-y-1">
              {filteredUsers.map(user => (
                <div
                  key={user.userId}
                  onClick={() => setSelectedUserId(user.userId)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedUserId === user.userId ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {getInitials(user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{user.messageCount}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(user.lastActive), 'MMM d')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No users found</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Conversation View */}
        <div className="lg:col-span-2 space-y-4">
          {selectedUserId ? (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Filter role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Messages</SelectItem>
                      <SelectItem value="user">User Only</SelectItem>
                      <SelectItem value="assistant">AI Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={exportConversations} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              <ScrollArea className="h-[500px] border rounded-lg p-4">
                <div className="space-y-4">
                  {filteredConversations.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                  {filteredConversations.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No messages found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="h-[500px] border rounded-lg flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Bot className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a user</p>
                <p className="text-sm">View their AI conversation history</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
