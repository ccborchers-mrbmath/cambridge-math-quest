import { useEffect, useSyncExternalStore } from 'react';
import { logger } from "@/lib/logger";
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

type AuthRole = 'admin' | 'student' | null;

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  userRole: AuthRole;
}

const subscribers = new Set<() => void>();

let authState: AuthState = {
  loading: true,
  session: null,
  user: null,
  userRole: null,
};

let initialized = false;
let roleRequestToken = 0;

const notify = () => {
  subscribers.forEach((callback) => callback());
};

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};

const getSnapshot = () => authState;

const updateAuthState = (patch: Partial<AuthState>) => {
  authState = { ...authState, ...patch };
  notify();
};

const fetchUserRole = async (userId: string) => {
  const requestToken = ++roleRequestToken;

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (requestToken !== roleRequestToken) return;
    if (error) throw error;

    const isAdmin = (data ?? []).some((row) => row.role === 'admin');
    updateAuthState({ userRole: isAdmin ? 'admin' : 'student', loading: false });
  } catch (error) {
    if (requestToken !== roleRequestToken) return;
    logger.error('Error fetching user role', error);
    updateAuthState({ userRole: 'student', loading: false });
  }
};

const syncSession = async (session: Session | null) => {
  updateAuthState({
    session,
    user: session?.user ?? null,
    userRole: session?.user ? authState.userRole : null,
    loading: Boolean(session?.user),
  });

  if (!session?.user) {
    roleRequestToken += 1;
    updateAuthState({ userRole: null, loading: false });
    return;
  }

  await fetchUserRole(session.user.id);
};

const initializeAuth = () => {
  if (initialized) return;
  initialized = true;

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      void syncSession(session);
    }
  );

  void supabase.auth.getSession().then(({ data: { session } }) => {
    void syncSession(session);
  });

  return subscription;
};

export const useAuth = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    initializeAuth();
  }, []);

  const signInWithGoogle = async (redirectPath?: string) => {
    const redirectUrl = new URL(window.location.origin);

    if (redirectPath) {
      redirectUrl.pathname = '/auth';
      redirectUrl.searchParams.set('redirect', redirectPath);
    }

    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: redirectUrl.toString(),
    });
    return { error: result.error ?? null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      roleRequestToken += 1;
      updateAuthState({ user: null, session: null, userRole: null, loading: false });
    }
    return { error };
  };

  return {
    user: snapshot.user,
    session: snapshot.session,
    userRole: snapshot.userRole,
    loading: snapshot.loading,
    signInWithGoogle,
    signOut,
  };
};
