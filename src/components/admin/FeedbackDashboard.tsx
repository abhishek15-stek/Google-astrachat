import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Star, 
  MessageCircle, 
  TrendingUp, 
  Users, 
  Clock,
  RefreshCw,
  Settings,
  BarChart3,
  Send,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';

interface FeedbackRequest {
  id: string;
  user_id: string;
  question: string;
  question_type: string;
  options: unknown;
  created_at: string;
  is_answered: boolean;
  context: string | null;
  profile?: {
    display_name: string | null;
    email: string;
  };
}

interface FeedbackResponse {
  id: string;
  request_id: string;
  user_id: string;
  star_rating: number | null;
  selected_option: string | null;
  text_response: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    email: string;
  };
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export function FeedbackDashboard() {
  const [requests, setRequests] = useState<FeedbackRequest[]>([]);
  const [responses, setResponses] = useState<FeedbackResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    enabled: true,
    intervalHours: 24,
    questionsPerSession: 1
  });
  const [newQuestion, setNewQuestion] = useState('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<'star_rating' | 'options' | 'mixed'>('mixed');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch requests with profiles
      const { data: requestsData } = await supabase
        .from('feedback_requests')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch responses
      const { data: responsesData } = await supabase
        .from('feedback_responses')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch profiles for users
      const userIds = [...new Set([
        ...(requestsData?.map(r => r.user_id) || []),
        ...(responsesData?.map(r => r.user_id) || [])
      ])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]));

      setRequests(requestsData?.map(r => ({
        ...r,
        profile: profileMap.get(r.user_id)
      })) || []);

      setResponses(responsesData?.map(r => ({
        ...r,
        profile: profileMap.get(r.user_id)
      })) || []);

      // Fetch settings
      const { data: settingsData } = await supabase
        .from('feedback_settings')
        .select('*');

      if (settingsData) {
        const settingsMap = new Map(settingsData.map(s => [s.setting_key, s.setting_value]));
        setSettings({
          enabled: settingsMap.get('enabled') === 'true',
          intervalHours: parseInt(settingsMap.get('feedback_interval_hours') as string) || 24,
          questionsPerSession: parseInt(settingsMap.get('questions_per_session') as string) || 1
        });
      }
    } catch (error) {
      console.error('Error fetching feedback data:', error);
      toast.error('Failed to load feedback data');
    }
    setLoading(false);
  };

  const updateSettings = async (key: string, value: string) => {
    try {
      await supabase
        .from('feedback_settings')
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq('setting_key', key);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const sendFeedbackToAllUsers = async () => {
    if (!newQuestion.trim()) {
      toast.error('Please enter a question');
      return;
    }

    try {
      // Get all active users
      const { data: users } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_banned', false);

      if (!users?.length) {
        toast.error('No active users found');
        return;
      }

      // Create feedback requests for all users
      const requests = users.map(user => ({
        user_id: user.id,
        question: newQuestion,
        question_type: selectedQuestionType,
        options: selectedQuestionType !== 'star_rating' 
          ? ['Not Good', 'Ok', 'Good', 'Great', 'Excellent'] 
          : null,
        context: 'admin_broadcast'
      }));

      const { error } = await supabase
        .from('feedback_requests')
        .insert(requests);

      if (error) throw error;

      toast.success(`Feedback request sent to ${users.length} users`);
      setNewQuestion('');
      fetchData();
    } catch (error) {
      console.error('Error sending feedback:', error);
      toast.error('Failed to send feedback request');
    }
  };

  // Analytics calculations
  const averageRating = responses.filter(r => r.star_rating)
    .reduce((acc, r) => acc + (r.star_rating || 0), 0) / 
    (responses.filter(r => r.star_rating).length || 1);

  const responseRate = requests.length > 0 
    ? (responses.length / requests.length * 100).toFixed(1)
    : 0;

  const optionCounts = responses.reduce((acc, r) => {
    if (r.selected_option) {
      acc[r.selected_option] = (acc[r.selected_option] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const optionData = Object.entries(optionCounts).map(([name, value]) => ({ name, value }));

  const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating: `${rating} Star`,
    count: responses.filter(r => r.star_rating === rating).length
  }));

  // Daily response trend (last 7 days)
  const last7Days = [...Array(7)].map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const dailyTrend = last7Days.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
    responses: responses.filter(r => r.created_at.startsWith(date)).length,
    avgRating: responses
      .filter(r => r.created_at.startsWith(date) && r.star_rating)
      .reduce((acc, r, _, arr) => acc + (r.star_rating || 0) / arr.length, 0) || 0
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Star className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Rating</p>
                <p className="text-2xl font-bold">{averageRating.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Response Rate</p>
                <p className="text-2xl font-bold">{responseRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Responses</p>
                <p className="text-2xl font-bold">{responses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Requests Sent</p>
                <p className="text-2xl font-bold">{requests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="responses" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Responses
          </TabsTrigger>
          <TabsTrigger value="send" className="gap-2">
            <Send className="h-4 w-4" />
            Send Feedback
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Rating Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Rating Distribution</CardTitle>
                <CardDescription>Star ratings from users</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={ratingDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rating" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Option Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Response Options</CardTitle>
                <CardDescription>Most selected options</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={optionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {optionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily Trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">7-Day Response Trend</CardTitle>
                <CardDescription>Responses and average rating over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 5]} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="responses" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="avgRating" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={{ fill: '#f59e0b' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>User Responses</CardTitle>
                <CardDescription>All feedback responses from users</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {responses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No responses yet</p>
                    </div>
                  ) : (
                    responses.map((response) => (
                      <div 
                        key={response.id} 
                        className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <span className="text-xs font-medium">
                                {response.profile?.display_name?.[0] || response.profile?.email?.[0] || '?'}
                              </span>
                            </div>
                            <span className="font-medium text-sm">
                              {response.profile?.display_name || response.profile?.email || 'Unknown'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(response.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {response.star_rating && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {response.star_rating} Stars
                            </Badge>
                          )}
                          {response.selected_option && (
                            <Badge variant="outline">{response.selected_option}</Badge>
                          )}
                        </div>
                        
                        {response.text_response && (
                          <p className="text-sm text-muted-foreground bg-background/50 p-2 rounded-lg">
                            "{response.text_response}"
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Send Feedback Request
              </CardTitle>
              <CardDescription>
                Broadcast a feedback question to all active users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Question Type</Label>
                <div className="flex gap-2">
                  {(['star_rating', 'options', 'mixed'] as const).map((type) => (
                    <Button
                      key={type}
                      variant={selectedQuestionType === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuestionType(type)}
                    >
                      {type === 'star_rating' ? '⭐ Stars Only' : 
                       type === 'options' ? '📋 Options Only' : '🎯 Both'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Question</Label>
                <Input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="How would you rate your experience with AstraChat today?"
                  className="bg-background"
                />
              </div>

              <Button onClick={sendFeedbackToAllUsers} className="w-full gap-2">
                <Send className="h-4 w-4" />
                Send to All Users
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feedback Settings</CardTitle>
              <CardDescription>Configure automated feedback collection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Automated Feedback</Label>
                  <p className="text-sm text-muted-foreground">
                    AI will automatically ask users for feedback
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(checked) => {
                    setSettings(s => ({ ...s, enabled: checked }));
                    updateSettings('enabled', String(checked));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Feedback Interval (hours)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={settings.intervalHours}
                    onChange={(e) => setSettings(s => ({ ...s, intervalHours: parseInt(e.target.value) }))}
                    onBlur={() => updateSettings('feedback_interval_hours', String(settings.intervalHours))}
                    className="w-24"
                    min={1}
                    max={168}
                  />
                  <span className="text-sm text-muted-foreground">
                    ({(settings.intervalHours / 24).toFixed(1)} days)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Questions Per Session</Label>
                <Input
                  type="number"
                  value={settings.questionsPerSession}
                  onChange={(e) => setSettings(s => ({ ...s, questionsPerSession: parseInt(e.target.value) }))}
                  onBlur={() => updateSettings('questions_per_session', String(settings.questionsPerSession))}
                  className="w-24"
                  min={1}
                  max={5}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
