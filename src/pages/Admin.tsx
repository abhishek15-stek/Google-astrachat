import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useAdmin } from '@/hooks/useAdmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { UserManagement } from '@/components/admin/UserManagement';
import { GroupManagement } from '@/components/admin/GroupManagement';
import { ChatLogs } from '@/components/admin/ChatLogs';
import { Analytics } from '@/components/admin/Analytics';
import { Announcements } from '@/components/admin/Announcements';
import { AdminActions } from '@/components/admin/AdminActions';
import { FeedbackDashboard } from '@/components/admin/FeedbackDashboard';
import { AIConversationsViewer } from '@/components/admin/AIConversationsViewer';
import { UserIssuesDashboard } from '@/components/admin/UserIssuesDashboard';
import { BadgeManagement } from '@/components/admin/BadgeManagement';
import { AICreditsPanel } from '@/components/admin/AICreditsPanel';
import { 
  MessageCircle, 
  ArrowLeft, 
  Moon, 
  Sun, 
  Users, 
  Layers, 
  FileText, 
  BarChart3,
  Shield,
  RefreshCw,
  Megaphone,
  Activity,
  Settings,
  Star,
  Bot,
  AlertTriangle,
  Award,
  Zap
} from 'lucide-react';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, canAccessDashboard, roleLevel, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    users,
    groups,
    chatLogs,
    announcements,
    analytics,
    loading,
    fetchUsers,
    fetchGroups,
    fetchChatLogs,
    fetchAnalytics,
    fetchAnnouncements,
    createGroup,
    deleteGroup,
    getGroupMembers,
    addUserToGroup,
    removeUserFromGroup,
    toggleUserBan,
    createAnnouncement,
    deleteAnnouncement,
    toggleAnnouncementActive,
    exportToCSV,
    deleteAllMessages,
    deleteAllGroups,
    deleteUserMessages,
  } = useAdmin();

  useEffect(() => {
    if (!authLoading && !canAccessDashboard) {
      navigate('/');
    }
  }, [authLoading, canAccessDashboard, navigate]);

  if (authLoading || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background bg-dots">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
            <Shield className="h-8 w-8 text-primary-foreground animate-pulse" />
          </div>
          <p className="text-muted-foreground font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!canAccessDashboard) {
    return null;
  }

  const canManageSystem = roleLevel >= 80;
  const canViewSensitive = roleLevel >= 60;

  return (
    <div className="min-h-screen bg-background bg-dots">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/')}
              className="h-9 w-9 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-sm">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Admin Dashboard</h1>
                <p className="text-xs text-muted-foreground">Manage your platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-4 mr-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="font-medium text-foreground">{users.length}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span className="font-medium text-foreground">{groups.length}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="font-medium text-green-500">Live</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleTheme}
              className="h-9 w-9 rounded-lg"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/')} 
              className="gap-2 rounded-lg h-9"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Chat</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="users" className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 rounded-xl gap-1">
              <TabsTrigger value="users" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Users</span>
              </TabsTrigger>
              {canViewSensitive && (
                <TabsTrigger value="groups" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">Groups</span>
                </TabsTrigger>
              )}
              {canManageSystem && (
                <TabsTrigger value="announcements" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                  <Megaphone className="h-4 w-4" />
                  <span className="hidden sm:inline">Broadcast</span>
                </TabsTrigger>
              )}
              {canViewSensitive && <TabsTrigger value="logs" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>}
              {canViewSensitive && <TabsTrigger value="analytics" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>}
              {canViewSensitive && <TabsTrigger value="feedback" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback</span>
              </TabsTrigger>}
              {canViewSensitive && <TabsTrigger value="ai-chats" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">AI Chats</span>
              </TabsTrigger>}
              {canViewSensitive && <TabsTrigger value="issues" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Issues</span>
              </TabsTrigger>}
              {isAdmin && <TabsTrigger value="badges" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Award className="h-4 w-4" />
                <span className="hidden sm:inline">Badges</span>
              </TabsTrigger>}
              {canViewSensitive && <TabsTrigger value="ai-credits" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">AI Credits</span>
              </TabsTrigger>}
              {isAdmin && <TabsTrigger value="actions" className="gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Actions</span>
              </TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="users" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">User Management</h2>
                <p className="text-sm text-muted-foreground">View, manage, and moderate users</p>
              </div>
              <Button variant="outline" onClick={fetchUsers} className="gap-2 rounded-lg">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            <UserManagement 
              users={users} 
              onRefresh={fetchUsers}
              onBanUser={toggleUserBan}
              onExport={exportToCSV}
              canModerate={canManageSystem}
            />
          </TabsContent>

          {canViewSensitive && <TabsContent value="groups" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Group Management</h2>
                <p className="text-sm text-muted-foreground">Create and manage chat groups</p>
              </div>
            </div>
            <GroupManagement
              groups={groups}
              users={users}
              onCreateGroup={createGroup}
              onDeleteGroup={deleteGroup}
              onGetMembers={getGroupMembers}
              onAddMember={addUserToGroup}
              onRemoveMember={removeUserFromGroup}
              onRefresh={fetchGroups}
              canManage={canManageSystem}
            />
          </TabsContent>}

          <TabsContent value="announcements" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Broadcast Center</h2>
                <p className="text-sm text-muted-foreground">Send announcements to all users or specific groups</p>
              </div>
              <Button variant="outline" onClick={fetchAnnouncements} className="gap-2 rounded-lg">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            <Announcements
              announcements={announcements}
              groups={groups}
              onCreateAnnouncement={createAnnouncement}
              onDeleteAnnouncement={deleteAnnouncement}
              onToggleActive={toggleAnnouncementActive}
              onRefresh={fetchAnnouncements}
            />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Chat Logs</h2>
                <p className="text-sm text-muted-foreground">Monitor all conversations</p>
              </div>
            </div>
            <ChatLogs
              chatLogs={chatLogs}
              groups={groups}
              onRefresh={fetchChatLogs}
            />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Analytics</h2>
                <p className="text-sm text-muted-foreground">Platform usage insights</p>
              </div>
              <Button variant="outline" onClick={fetchAnalytics} className="gap-2 rounded-lg">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            <Analytics analytics={analytics} />
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">User Feedback</h2>
                <p className="text-sm text-muted-foreground">AI-driven feedback collection and analytics</p>
              </div>
            </div>
            <FeedbackDashboard />
          </TabsContent>

          <TabsContent value="ai-chats" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">AI Conversations</h2>
                <p className="text-sm text-muted-foreground">View all user conversations with AI assistant</p>
              </div>
            </div>
            <AIConversationsViewer />
          </TabsContent>

          <TabsContent value="issues" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">User Reported Issues</h2>
                <p className="text-sm text-muted-foreground">Problems reported by users through AI chat, categorized and tracked</p>
              </div>
            </div>
            <UserIssuesDashboard />
          </TabsContent>

          <TabsContent value="badges" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Badge & Role Management</h2>
                <p className="text-sm text-muted-foreground">Assign roles and permissions to users</p>
              </div>
              <Button variant="outline" onClick={fetchUsers} className="gap-2 rounded-lg">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            <BadgeManagement users={users} onRefresh={fetchUsers} />
          </TabsContent>

          <TabsContent value="ai-credits" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">AI Credits & Usage</h2>
                <p className="text-sm text-muted-foreground">Live Gemini AI usage across every user — text, image, video, file, advanced</p>
              </div>
            </div>
            <AICreditsPanel />
          </TabsContent>

          <TabsContent value="actions" className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Admin Actions</h2>
                <p className="text-sm text-muted-foreground">Dangerous actions - use with caution</p>
              </div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-destructive">
                <Settings className="h-5 w-5" />
                <h3 className="font-semibold">Destructive Actions</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                These actions are permanent and cannot be undone. Please use with extreme caution.
              </p>
              <AdminActions
                users={users}
                groups={groups}
                onRefresh={() => {
                  fetchChatLogs();
                  fetchGroups();
                  fetchUsers();
                }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
