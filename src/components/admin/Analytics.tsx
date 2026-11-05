import { Analytics as AnalyticsType } from '@/hooks/useAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Users, MessageCircle, Layers, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';

interface AnalyticsProps {
  analytics: AnalyticsType | null;
}

export function Analytics({ analytics }: AnalyticsProps) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const maxMessagesPerGroup = Math.max(...analytics.messagesPerGroup.map(g => g.count), 1);
  const maxMessagesByDay = Math.max(...analytics.messagesByDay.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalUsers}</div>
            <p className="text-xs text-muted-foreground">Registered accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalGroups}</div>
            <p className="text-xs text-muted-foreground">Active chat groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalMessages}</div>
            <p className="text-xs text-muted-foreground">All time messages</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages per Group */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Messages per Group
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-4">
                {analytics.messagesPerGroup.length > 0 ? (
                  analytics.messagesPerGroup.map((group, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{group.group_name}</span>
                        <span className="text-muted-foreground">{group.count}</span>
                      </div>
                      <Progress value={(group.count / maxMessagesPerGroup) * 100} className="h-2" />
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">No group messages yet</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Most Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {analytics.activeUsers.length > 0 ? (
                  analytics.activeUsers.map((user, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{user.user_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Last active: {format(new Date(user.last_active), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{user.message_count}</p>
                        <p className="text-xs text-muted-foreground">messages</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">No active users yet</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Messages by Day Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5" />
            Messages Over Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2 h-48">
            {analytics.messagesByDay.map((day, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-primary rounded-t-md transition-all duration-300 hover:bg-primary/80"
                  style={{
                    height: `${Math.max((day.count / maxMessagesByDay) * 100, 5)}%`,
                    minHeight: '8px',
                  }}
                />
                <div className="text-center">
                  <p className="text-xs font-medium">{day.count}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(day.date), 'EEE')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
