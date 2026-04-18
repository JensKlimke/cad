/**
 * TanStack Query hooks for the `/auth` route group.
 */

import {
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MeSessionResponseSchema,
  type LoginRequest,
  type MeSessionResponse,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './client.js';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useMe() {
  return useQuery<MeSessionResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => apiFetch('/auth/me', { schema: MeSessionResponseSchema }),
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
