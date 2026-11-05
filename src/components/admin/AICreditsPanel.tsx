import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sparkles, Image as ImageIcon, Video, FileText, Zap, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';

interface CreditRow {
  user_id: string;
  bucket_date: string;
  text_used: number;
  image_used: number;
  video_used: number;
  file_used: number;
  advanced_used: number;
}

interface LogRow {
  id: string;
  user_id: string;
  model: string;
  kind: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  created_at: string;
}

interface Profile { id: string; display_name: string | null; email: string }

export function AICreditsPanel() {
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: cr }, { data: lg }, { data: pr }] = await Promise.all([
      supabase.from('ai_credits').select('*').eq('bucket_date', today),
      supabase.from('ai_usage_log').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('id, display_name, email'),
    ]);
    setCredits((cr as any) || []);
    setLogs((lg as any) || []);
    const map: Record<string, Profile> = {};
    (pr || []).forEach((p: any) => { map[p.id] = p; });
    setProfiles(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const t = { text: 0, image: 0, video: 0, file: 0, advanced: 0, calls: logs.length };
    credits.forEach(c => {
      t.text += c.text_used;
      t.image += c.image_used;
      t.video += c.video_used;
      t.file += c.file_used;
      t.advanced += c.advanced_used;
    });
    return t;
  }, [credits, logs]);

  const filtered = useMemo(() => {
    if (!query) return credits;
    const q = query.toLowerCase();
    return credits.filter(c => {
      const p = profiles[c.user_id];
      return p?.email?.toLowerCase().includes(q) || p?.display_name?.toLowerCase().includes(q);
    });
  }, [credits, profiles, query]);

  const kindIcon: Record<string, JSX.Element> = {
    text: <Sparkles className="h-3 w-3" />,
    image: <ImageIcon className="h-3 w-3" />,
    video: <Video className="h-3 w-3" />,
    file: <FileText className="h-3 w-3" />,
    advanced: <Zap className="h-3 w-3" />,
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total Calls', value: totals.calls, icon: <Sparkles className="h-4 w-4" />, color: 'from-primary to-accent' },
          { label: 'Text', value: totals.text, icon: <Sparkles className="h-4 w-4" />, color: 'from-blue-500 to-cyan-500' },
          { label: 'Images', value: totals.image, icon: <ImageIcon className="h-4 w-4" />, color: 'from-pink-500 to-rose-500' },
          { label: 'Videos', value: totals.video, icon: <Video className="h-4 w-4" />, color: 'from-purple-500 to-fuchsia-500' },
          { label: 'Files', value: totals.file, icon: <FileText className="h-4 w-4" />, color: 'from-amber-500 to-orange-500' },
          { label: 'Advanced', value: totals.advanced, icon: <Zap className="h-4 w-4" />, color: 'from-emerald-500 to-teal-500' },
        ].map((k) => (
          <Card key={k.label} className="overflow-hidden border-border/50 hover:shadow-glow transition-shadow">
            <CardContent className="p-4">
              <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center text-white mb-2 shadow-sm`}>{k.icon}</div>
              <div className="text-2xl font-bold tabular-nums">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-user table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Today's per-user usage</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-7 w-48" placeholder="Search user" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Text</TableHead>
                  <TableHead className="text-right">Image</TableHead>
                  <TableHead className="text-right">Video</TableHead>
                  <TableHead className="text-right">File</TableHead>
                  <TableHead className="text-right">Advanced</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No usage today.</TableCell></TableRow>
                ) : filtered.map((c) => {
                  const p = profiles[c.user_id];
                  const total = c.text_used + c.image_used + c.video_used + c.file_used + c.advanced_used;
                  return (
                    <TableRow key={c.user_id}>
                      <TableCell>
                        <div className="font-medium">{p?.display_name || p?.email || c.user_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground">{p?.email}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.text_used}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.image_used}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.video_used}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.file_used}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.advanced_used}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{total}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent call log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent AI calls (last 200)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => {
                  const p = profiles[l.user_id];
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{format(new Date(l.created_at), 'HH:mm:ss')}</TableCell>
                      <TableCell className="text-sm">{p?.display_name || p?.email || l.user_id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 capitalize">{kindIcon[l.kind]}{l.kind}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{l.model}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{l.tokens_in}/{l.tokens_out}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{l.duration_ms}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
