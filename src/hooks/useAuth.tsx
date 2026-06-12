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

const syncSession = (session: Session | null) => {
  // Temporary: every signed-in user is treated as admin while role-based
  // gating is rolled back. See plan in .lovable/plan.md.
  updateAuthState({
    session,
    user: session?.user ?? null,
    userRole: session?.user ? 'admin' : null,
    loading: false,
  });
};

const initializeAuth = () => {
  if (initialized) return;
  initialized = true;

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      syncSession(session);
    }
  );

  void supabase.auth.getSession().then(({ data: { session } }) => {
    syncSession(session);
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
