/**
 * TanStack Query hooks for the `/projects` route group.
 */

import {
  CreateProjectRequestSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from './client.js';

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const projectQueryKey = (id: string) => ['projects', id] as const;

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async () =>
      apiFetch('/projects', { schema: ListProjectsResponseSchema, query: { limit: 50 } }),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id === undefined ? PROJECTS_QUERY_KEY : projectQueryKey(id),
    queryFn: async () => {
      if (id === undefined) {
        throw new Error('useProject: id is required');
      }
      return apiFetch(`/projects/${id}`, { schema: ProjectSchema });
    },
    enabled: id !== undefined,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, CreateProjectRequest>({
    mutationFn: async (input) =>
      apiFetch('/projects', {
        method: 'POST',
        body: CreateProjectRequestSchema.parse(input),
        schema: ProjectSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, UpdateProjectRequest>({
    mutationFn: async (input) =>
      apiFetch(`/projects/${id}`, {
        method: 'PATCH',
        body: UpdateProjectRequestSchema.parse(input),
        schema: ProjectSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation<null, Error, string>({
    mutationFn: async (id) => apiFetch(`/projects/${id}`, { method: 'DELETE', schema: z.null() }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: projectQueryKey(id), exact: true });
      queryClient.removeQueries({ queryKey: ['projects', id, 'documents'], exact: true });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true });
    },
  });
}
