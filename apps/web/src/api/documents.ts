/**
 * TanStack Query hooks for persisted documents and Slice 2 builds.
 */

import {
  BuildDocumentResponseSchema,
  DocumentSchema,
  RuntimeDiagnosticSchema,
  UpdateDocumentRequestSchema,
  type BuildDocumentResponse,
  type Document,
  type RuntimeDiagnostic,
  type UpdateDocumentRequest,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError, apiFetch } from './client.js';

import type { TessellationResult } from '@cad/kernel';

export const documentQueryKey = (id: string) => ['documents', id] as const;
export const documentBuildQueryKey = (id: string) => ['documents', id, 'build'] as const;

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: id === undefined ? ['documents'] : documentQueryKey(id),
    queryFn: async () => {
      if (id === undefined) {
        throw new Error('useDocument: id is required');
      }
      return apiFetch(`/documents/${id}`, { schema: DocumentSchema });
    },
    enabled: id !== undefined,
  });
}

export function useUpdateDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Document, Error, UpdateDocumentRequest>({
    mutationFn: async (input) =>
      apiFetch(`/documents/${id}`, {
        method: 'PATCH',
        body: UpdateDocumentRequestSchema.parse(input),
        schema: DocumentSchema,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(documentQueryKey(id), updated);
      await queryClient.invalidateQueries({ queryKey: documentQueryKey(id) });
    },
  });
}

export function useBuildDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation<BuildDocumentResponse, Error>({
    mutationFn: async () =>
      apiFetch(`/documents/${id}/build`, {
        method: 'POST',
        schema: BuildDocumentResponseSchema,
      }),
    onSuccess: async (build) => {
      queryClient.setQueryData(documentBuildQueryKey(id), build);
    },
  });
}

export function buildToTessellation(build: BuildDocumentResponse): TessellationResult {
  return {
    positions: new Float32Array(build.build.tessellation.positions),
    normals: new Float32Array(build.build.tessellation.normals),
    indices: new Uint32Array(build.build.tessellation.indices),
    metadata: {
      hash: build.build.tessellation.metadata.hash,
      triangleCount: build.build.tessellation.metadata.triangleCount,
      vertexCount: build.build.tessellation.metadata.vertexCount,
      bbox: {
        min: [...build.build.tessellation.metadata.bbox.min] as [number, number, number],
        max: [...build.build.tessellation.metadata.bbox.max] as [number, number, number],
      },
    },
  };
}

export function diagnosticsFromError(error: unknown): RuntimeDiagnostic[] {
  if (!(error instanceof ApiClientError)) {
    return [];
  }
  const details = error.envelope.error.details;
  if (
    typeof details !== 'object' ||
    details === null ||
    !('diagnostics' in details) ||
    !Array.isArray(details.diagnostics)
  ) {
    return [];
  }
  return details.diagnostics
    .map((diagnostic) => RuntimeDiagnosticSchema.safeParse(diagnostic))
    .flatMap((result) => (result.success ? [result.data] : []));
}
