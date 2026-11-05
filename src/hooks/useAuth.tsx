import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  role: AppRole;
  roleLevel: number;
  canAccessDashboard: boolean;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AppRole = 'admin' | 'sub_admin' | 'senior_member' | 'member' | 'user' | 'spectator';

const ROLE_LEVEL: Record<AppRole, number> = {
  admin: 100,
  sub_admin: 80,
  senior_member: 60,
  member: 40,
  user: 20,
  spectator: 10,
};

const dashboardRoles = new Set<AppRole>(['admin', 'sub_admin', 'senior_member']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AppRole>('user');
  const [loading, setLoading] = useState(true);

  const loadUserRole = async (userId: string): Promise<AppRole> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking admin role:', error);
        return 'user';
      }

      return (data?.role as AppRole) || 'user';
    } catch (error) {
      console.error('Error checking admin role:', error);
      return 'user';
    }
  };

  const applyRole = (nextRole: AppRole) => {
    setRole(nextRole);
    setIsAdmin(nextRole === 'admin');
  };

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Ensure loading is ALWAYS resolved within 3.5s even if network stalls
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 3500);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          loadUserRole(session.user.id)
            .then((r) => {
              if (isMounted) applyRole(r);
            })
            .catch(() => {
              if (isMounted) applyRole('user');
            });
        } else {
          applyRole('user');
        }
      }
    );

    // THEN check for existing session with timeout and catch
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          try {
            const nextRole = await loadUserRole(session.user.id);
            if (isMounted) applyRole(nextRole);
          } catch {
            if (isMounted) applyRole('user');
          }
        } else {
          if (isMounted) applyRole('user');
        }
      } catch (err) {
        console.warn('Auth session check completed with fallback:', err);
        if (isMounted) applyRole('user');
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    applyRole('user');
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });

    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAdmin,
      role,
      roleLevel: ROLE_LEVEL[role],
      canAccessDashboard: dashboardRoles.has(role),
      loading,
      signUp,
      signIn,
      signOut,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}