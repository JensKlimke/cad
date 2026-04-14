/**
 * Authentication context.
 *
 * Wraps `useMe` and the login / logout mutations so every consumer
 * gets the same `AuthState` shape and the same React Query cache
 * is invalidated on login / logout. Components that need the
 * authenticated user read it via `useAuth()`.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { useLogin, useLogout, useMe } from '../api/auth.js';

import type { MeResponse } from '@cad/protocol';

export interface AuthState {
  /** Resolved user, or `null` when unauthenticated, or `undefined` while loading. */
  readonly me: MeResponse | null | undefined;
  readonly isLoading: boolean;
  readonly login: (input: { email: string; password: string }) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const meQuery = useMe();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      await loginMutation.mutateAsync(input);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthState>(
    () => ({
      me: meQuery.data,
      isLoading: meQuery.isPending,
      login,
      logout,
    }),
    [meQuery.data, meQuery.isPending, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
