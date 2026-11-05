import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'sub_admin' | 'senior_member' | 'member' | 'user' | 'spectator';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_active: string | null;
  role: AppRole;
  is_banned?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string;
  member_count: number;
}

export interface GroupMember {
  id: string;
  user_id: string;
  group_id: string;
  joined_at: string;
  user?: User;
}

export interface ChatLog {
  id: string;
  sender_id: string;
  receiver_type: string;
  receiver_id: string;
  content: string;
  created_at: string;
  sender?: {
    display_name: string | null;
    email: string;
  };
  receiver_name?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  target_type: 'all' | 'group' | 'user';
  target_id: string | null;
}

export interface Analytics {
  totalUsers: number;
  totalGroups: number;
  totalMessages: number;
  messagesPerGroup: { group_name: string; count: number }[];
  activeUsers: { user_name: string; message_count: number; last_active: string }[];
  messagesByDay: { date: string; count: number }[];
  bannedUsers: number;
  activeAnnouncements: number;
}

export function useAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all users with their roles
  const fetchUsers = useCallback(async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      const usersWithRoles: User[] = (profiles || []).map(p => ({
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        created_at: p.created_at,
        last_active: p.last_active,
        role: (roleMap.get(p.id) as AppRole) || 'user',
        is_banned: (p as { is_banned?: boolean }).is_banned || false,
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  // Fetch all groups with member counts
  const fetchGroups = useCallback(async () => {
    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      const { data: memberCounts, error: countError } = await supabase
        .from('group_members')
        .select('group_id');

      if (countError) throw countError;

      const countMap = new Map<string, number>();
      memberCounts?.forEach(m => {
        countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
      });

      const groupsWithCounts: Group[] = (groupsData || []).map(g => ({
        ...g,
        member_count: countMap.get(g.id) || 0,
      }));

      setGroups(groupsWithCounts);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  }, []);

  // Create a new group
  const createGroup = useCallback(async (name: string, description: string, memberIds: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name,
          description,
          created_by: user.id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add members
      if (memberIds.length > 0) {
        const members = memberIds.map(userId => ({
          group_id: group.id,
          user_id: userId,
        }));

        const { error: membersError } = await supabase
          .from('group_members')
          .insert(members);

        if (membersError) throw membersError;
      }

      await fetchGroups();
      return group;
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }, [fetchGroups]);

  // Delete a group
  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      // First delete all members
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId);

      // Then delete the group
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      await fetchGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }, [fetchGroups]);

  // Get group members
  const getGroupMembers = useCallback(async (groupId: string): Promise<GroupMember[]> => {
    try {
      // First fetch the group members
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('id, user_id, group_id, joined_at')
        .eq('group_id', groupId);

      if (membersError) throw membersError;
      if (!membersData || membersData.length === 0) return [];

      // Then fetch profiles for all member user_ids
      const userIds = membersData.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return membersData.map(m => ({
        id: m.id,
        user_id: m.user_id,
        group_id: m.group_id,
        joined_at: m.joined_at,
        user: profileMap.get(m.user_id) as unknown as User,
      }));
    } catch (error) {
      console.error('Error fetching group members:', error);
      return [];
    }
  }, []);

  // Add user to group
  const addUserToGroup = useCallback(async (groupId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: userId,
        });

      if (error) throw error;
      await fetchGroups();
    } catch (error) {
      console.error('Error adding user to group:', error);
      throw error;
    }
  }, [fetchGroups]);

  // Remove user from group
  const removeUserFromGroup = useCallback(async (groupId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (error) throw error;
      await fetchGroups();
    } catch (error) {
      console.error('Error removing user from group:', error);
      throw error;
    }
  }, [fetchGroups]);

  // Fetch chat logs with filters
  const fetchChatLogs = useCallback(async (
    receiverType?: string,
    receiverId?: string,
    limit = 100
  ) => {
    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (receiverType) {
        query = query.eq('receiver_type', receiverType);
      }
      if (receiverId) {
        query = query.eq('receiver_id', receiverId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get sender profiles and group names
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      const groupIds = [...new Set((data || []).filter(m => m.receiver_type === 'group').map(m => m.receiver_id))];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', senderIds);

      const { data: groupsData } = await supabase
        .from('groups')
        .select('id, name')
        .in('id', groupIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const groupMap = new Map(groupsData?.map(g => [g.id, g.name]) || []);

      const logsWithDetails: ChatLog[] = (data || []).map(m => ({
        ...m,
        sender: profileMap.get(m.sender_id),
        receiver_name: m.receiver_type === 'group' 
          ? groupMap.get(m.receiver_id) || 'Unknown Group'
          : 'Admin Chat',
      }));

      setChatLogs(logsWithDetails);
    } catch (error) {
      console.error('Error fetching chat logs:', error);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      // Get counts
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: groupCount } = await supabase
        .from('groups')
        .select('*', { count: 'exact', head: true });

      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });

      // Get messages per group
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name');

      const messagesPerGroup: { group_name: string; count: number }[] = [];
      if (groups) {
        for (const group of groups) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_type', 'group')
            .eq('receiver_id', group.id);
          
          messagesPerGroup.push({
            group_name: group.name,
            count: count || 0,
          });
        }
      }

      // Get active users (by message count)
      const { data: messages } = await supabase
        .from('messages')
        .select('sender_id, created_at');

      const userMessageCount = new Map<string, { count: number; last_active: string }>();
      messages?.forEach(m => {
        const existing = userMessageCount.get(m.sender_id);
        if (existing) {
          existing.count++;
          if (m.created_at > existing.last_active) {
            existing.last_active = m.created_at;
          }
        } else {
          userMessageCount.set(m.sender_id, { count: 1, last_active: m.created_at });
        }
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name');

      const profileMap = new Map(profiles?.map(p => [p.id, p.display_name || p.email]) || []);

      const activeUsers = Array.from(userMessageCount.entries())
        .map(([userId, data]) => ({
          user_name: profileMap.get(userId) || 'Unknown',
          message_count: data.count,
          last_active: data.last_active,
        }))
        .sort((a, b) => b.message_count - a.message_count)
        .slice(0, 10);

      // Messages by day (last 7 days)
      const messagesByDay: { date: string; count: number }[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayMessages = messages?.filter(m => 
          m.created_at.startsWith(dateStr)
        ).length || 0;

        messagesByDay.push({
          date: dateStr,
          count: dayMessages,
        });
      }

      // Get banned users count
      const { count: bannedCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true);

      // Get active announcements count
      const { count: announcementCount } = await supabase
        .from('system_announcements')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      setAnalytics({
        totalUsers: userCount || 0,
        totalGroups: groupCount || 0,
        totalMessages: messageCount || 0,
        messagesPerGroup: messagesPerGroup.sort((a, b) => b.count - a.count),
        activeUsers,
        messagesByDay,
        bannedUsers: bannedCount || 0,
        activeAnnouncements: announcementCount || 0,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, []);

  // Ban/Unban user
  const toggleUserBan = useCallback(async (userId: string, isBanned: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: isBanned })
        .eq('id', userId);

      if (error) throw error;
      await fetchUsers();
    } catch (error) {
      console.error('Error toggling user ban:', error);
      throw error;
    }
  }, [fetchUsers]);

  // Fetch announcements
  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements((data || []) as Announcement[]);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  }, []);

  // Create announcement
  const createAnnouncement = useCallback(async (
    title: string,
    content: string,
    targetType: 'all' | 'group' | 'user' = 'all',
    targetId?: string,
    expiresAt?: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('system_announcements')
        .insert({
          title,
          content,
          created_by: user.id,
          target_type: targetType,
          target_id: targetId || null,
          expires_at: expiresAt || null,
        });

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      throw error;
    }
  }, [fetchAnnouncements]);

  // Delete announcement
  const deleteAnnouncement = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('system_announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      throw error;
    }
  }, [fetchAnnouncements]);

  // Toggle announcement active status
  const toggleAnnouncementActive = useCallback(async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('system_announcements')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error toggling announcement:', error);
      throw error;
    }
  }, [fetchAnnouncements]);

  // Export data to CSV
  const exportToCSV = useCallback((data: object[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = (row as Record<string, unknown>)[header];
          const strValue = String(value ?? '');
          return `"${strValue.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }, []);

  // Initial fetch
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchUsers(),
        fetchGroups(),
        fetchChatLogs(),
        fetchAnalytics(),
        fetchAnnouncements(),
      ]);
      setLoading(false);
    };

    fetchAll();
  }, [fetchUsers, fetchGroups, fetchChatLogs, fetchAnalytics, fetchAnnouncements]);

  // Delete all messages
  const deleteAllMessages = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      await fetchChatLogs();
    } catch (error) {
      console.error('Error deleting all messages:', error);
      throw error;
    }
  }, [fetchChatLogs]);

  // Delete all groups
  const deleteAllGroups = useCallback(async () => {
    try {
      // First delete all group members
      await supabase
        .from('group_members')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Delete all group messages
      await supabase
        .from('messages')
        .delete()
        .eq('receiver_type', 'group');

      // Delete all groups
      const { error } = await supabase
        .from('groups')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      await fetchGroups();
    } catch (error) {
      console.error('Error deleting all groups:', error);
      throw error;
    }
  }, [fetchGroups]);

  // Delete user's messages
  const deleteUserMessages = useCallback(async (userId: string) => {
    try {
      // Delete messages sent by this user
      await supabase
        .from('messages')
        .delete()
        .eq('sender_id', userId);

      // Delete admin chat messages for this user
      await supabase
        .from('messages')
        .delete()
        .eq('receiver_type', 'admin')
        .eq('receiver_id', userId);

      await fetchChatLogs();
    } catch (error) {
      console.error('Error deleting user messages:', error);
      throw error;
    }
  }, [fetchChatLogs]);

  return {
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
  };
}
