import { useState } from 'react';
import { ChatLog, Group } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Search, RefreshCw, Users, Shield } from 'lucide-react';
import { format } from 'date-fns';

interface ChatLogsProps {
  chatLogs: ChatLog[];
  groups: Group[];
  onRefresh: (receiverType?: string, receiverId?: string) => void;
}

export function ChatLogs({ chatLogs, groups, onRefresh }: ChatLogsProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterGroupId, setFilterGroupId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const type = filterType === 'all' ? undefined : filterType;
    const groupId = filterType === 'group' && filterGroupId ? filterGroupId : undefined;
    await onRefresh(type, groupId);
    setRefreshing(false);
  };

  const filteredLogs = chatLogs.filter(log => {
    const matchesSearch = 
      log.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.sender?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (log.sender?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    const matchesType = 
      filterType === 'all' ||
      log.receiver_type === filterType;

    const matchesGroup = 
      !filterGroupId ||
      log.receiver_id === filterGroupId;

    return matchesSearch && matchesType && matchesGroup;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages or senders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={(value) => {
          setFilterType(value);
          if (value !== 'group') setFilterGroupId('');
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Messages</SelectItem>
            <SelectItem value="admin">Admin Chats</SelectItem>
            <SelectItem value="group">Group Chats</SelectItem>
          </SelectContent>
        </Select>
        {filterType === 'group' && (
          <Select value={filterGroupId} onValueChange={setFilterGroupId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold">{chatLogs.length}</p>
          <p className="text-sm text-muted-foreground">Total Messages</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold">{chatLogs.filter(l => l.receiver_type === 'admin').length}</p>
          <p className="text-sm text-muted-foreground">Admin Chat Messages</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold">{chatLogs.filter(l => l.receiver_type === 'group').length}</p>
          <p className="text-sm text-muted-foreground">Group Messages</p>
        </div>
      </div>

      {/* Chat Logs */}
      <ScrollArea className="h-[400px] border rounded-lg">
        <div className="divide-y divide-border">
          {filteredLogs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-accent/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                  log.receiver_type === 'group' ? 'bg-primary' : 'bg-secondary'
                }`}>
                  {log.receiver_type === 'group' 
                    ? <Users className="h-5 w-5 text-primary-foreground" />
                    : <Shield className="h-5 w-5 text-secondary-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {log.sender?.display_name || log.sender?.email || 'Unknown'}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant={log.receiver_type === 'group' ? 'default' : 'secondary'}>
                      {log.receiver_name}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm bg-muted/50 p-3 rounded-lg">
                    {log.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filteredLogs.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
