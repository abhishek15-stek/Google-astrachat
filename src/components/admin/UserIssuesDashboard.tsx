import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Search, AlertTriangle, CheckCircle, Clock, Filter, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReportedIssue {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  category: string;
  main_problem: string;
  detailed_explanation: string | null;
  action_taken: string | null;
  action_taken_by: string | null;
  user_feedback: string | null;
  status: string;
  priority: string | null;
  follow_up_count: number | null;
  last_follow_up_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive/20 text-destructive border-destructive/30',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const CATEGORY_EMOJIS: Record<string, string> = {
  audio: '🎤', ui: '🖥️', messaging: '💬', login: '🔐', performance: '⚡',
  file: '📁', bug: '🐛', general: '📋',
};

export function UserIssuesDashboard() {
  const { toast } = useToast();
  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<ReportedIssue | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    let query = supabase
      .from('user_reported_issues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);

    const { data, error } = await query;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setIssues((data as ReportedIssue[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchIssues(); }, [statusFilter, categoryFilter]);

  const updateIssueStatus = async (issueId: string, status: string) => {
    const updates: any = { status };
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();

    const { error } = await supabase
      .from('user_reported_issues')
      .update(updates)
      .eq('id', issueId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Issue marked as ${status}` });
      fetchIssues();
      if (selectedIssue?.id === issueId) {
        setSelectedIssue(prev => prev ? { ...prev, status, ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}) } : null);
      }
    }
  };

  const exportIssues = () => {
    const csv = [
      'User,Email,Category,Problem,Status,Priority,Date,Action Taken',
      ...issues.map(i =>
        `"${i.user_name || ''}","${i.user_email || ''}","${i.category}","${i.main_problem.replace(/"/g, '""')}","${i.status}","${i.priority || ''}","${new Date(i.created_at).toLocaleDateString()}","${(i.action_taken || '').replace(/"/g, '""')}"`
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-issues-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = issues.filter(i =>
    !search || 
    i.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.user_email?.toLowerCase().includes(search.toLowerCase()) ||
    i.main_problem.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = issues.filter(i => i.status === 'open').length;
  const inProgressCount = issues.filter(i => i.status === 'in_progress').length;
  const resolvedCount = issues.filter(i => i.status === 'resolved').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-yellow-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{openCount}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{inProgressCount}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{resolvedCount}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Filter className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{issues.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search issues..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="audio">🎤 Audio</SelectItem>
            <SelectItem value="ui">🖥️ UI</SelectItem>
            <SelectItem value="messaging">💬 Messaging</SelectItem>
            <SelectItem value="login">🔐 Login</SelectItem>
            <SelectItem value="performance">⚡ Performance</SelectItem>
            <SelectItem value="file">📁 File</SelectItem>
            <SelectItem value="bug">🐛 Bug</SelectItem>
            <SelectItem value="general">📋 General</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchIssues}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={exportIssues} className="gap-1">
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      {/* Issues List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Reported Issues ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No issues found</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map(issue => (
                      <div
                        key={issue.id}
                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedIssue?.id === issue.id ? 'bg-muted/70' : ''}`}
                        onClick={() => setSelectedIssue(issue)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{CATEGORY_EMOJIS[issue.category] || '📋'}</span>
                              <span className="font-medium text-sm truncate">{issue.user_name || issue.user_email || 'Unknown'}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[issue.status] || ''}`}>
                                {issue.status}
                              </Badge>
                              {issue.priority && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[issue.priority] || ''}`}>
                                  {issue.priority}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{issue.main_problem}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(issue.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div>
          <Card className="sticky top-24">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Issue Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedIssue ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="font-medium">{selectedIssue.user_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{selectedIssue.user_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p>{CATEGORY_EMOJIS[selectedIssue.category] || ''} {selectedIssue.category}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Problem</p>
                    <p className="text-sm">{selectedIssue.main_problem}</p>
                  </div>
                  {selectedIssue.detailed_explanation && (
                    <div>
                      <p className="text-xs text-muted-foreground">Full Description</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedIssue.detailed_explanation}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className={STATUS_COLORS[selectedIssue.status] || ''}>{selectedIssue.status}</Badge>
                  </div>
                  {selectedIssue.action_taken && (
                    <div>
                      <p className="text-xs text-muted-foreground">Action Taken</p>
                      <p className="text-sm">{selectedIssue.action_taken} ({selectedIssue.action_taken_by})</p>
                    </div>
                  )}
                  {selectedIssue.user_feedback && (
                    <div>
                      <p className="text-xs text-muted-foreground">User Feedback</p>
                      <p className="text-sm">{selectedIssue.user_feedback}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Reported</p>
                    <p className="text-sm">{new Date(selectedIssue.created_at).toLocaleString()}</p>
                  </div>
                  {selectedIssue.follow_up_count ? (
                    <div>
                      <p className="text-xs text-muted-foreground">Follow-ups</p>
                      <p className="text-sm">{selectedIssue.follow_up_count} times</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedIssue.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => updateIssueStatus(selectedIssue.id, 'in_progress')}>
                        Mark In Progress
                      </Button>
                    )}
                    {selectedIssue.status !== 'resolved' && (
                      <Button size="sm" variant="default" onClick={() => updateIssueStatus(selectedIssue.id, 'resolved')}>
                        Mark Resolved
                      </Button>
                    )}
                    {selectedIssue.status !== 'closed' && (
                      <Button size="sm" variant="ghost" onClick={() => updateIssueStatus(selectedIssue.id, 'closed')}>
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select an issue to view details</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
