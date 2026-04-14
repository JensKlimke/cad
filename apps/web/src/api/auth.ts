/**
 * TanStack Query hooks for the `/auth` route group.
 */

import {
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  type LoginRequest,
  type MeResponse,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './client.js';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch('/auth/me', { schema: MeResponseSchema });
      } catch (error: unknown) {
        // Treat 401 as "not authenticated" rather than an error so
        // the AuthContext can render the unauthenticated branch
        // instead of an error toast.
        if (
          error !== null &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status: number }).status === 401
        ) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginRequest) =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: LoginRequestSchema.parse(input),
        schema: LoginResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch('/auth/logout', {
        method: 'POST',
        schema: LogoutResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}
