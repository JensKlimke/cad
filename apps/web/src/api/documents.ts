/**
 * TanStack Query hooks for persisted documents and Slice 2 builds.
 */

import {
  BuildDocumentResponseSchema,
  DocumentBuildEventSchema,
  DocumentSchema,
  RuntimeDiagnosticSchema,
  UpdateDocumentRequestSchema,
  type BuildDocumentResponse,
  type Document,
  type RuntimeDiagnostic,
  type UpdateDocumentRequest,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ApiClientError, apiFetch, buildApiUrl } from './client.js';

import type { TessellationResult } from '@cad/kernel';

export const documentQueryKey = (id: string) => ['documents', id] as const;
export const documentBuildQueryKey = (id: string) => ['documents', id, 'build'] as const;
export const documentBuildStreamStateQueryKey = (id: string) =>
  ['documents', id, 'build-stream'] as const;

export type DocumentBuildStreamState =
  | null
  | {
      readonly kind: 'running';
      readonly documentId: string;
    }
  | {
      readonly kind: 'ready';
      readonly documentId: string;
      readonly hash: string;
    }
  | {
      readonly kind: 'failed';
      readonly documentId: string;
      readonly message: string;
      readonly diagnostics: readonly RuntimeDiagnostic[];
    };

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
      queryClient.setQueryData(documentBuildStreamStateQueryKey(id), {
        kind: 'ready',
        documentId: build.documentId,
        hash: build.build.tessellation?.metadata.hash ?? build.build.documentHash,
      } satisfies DocumentBuildStreamState);
    },
  });
}

export function useDocumentBuildState(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery<BuildDocumentResponse | null>({
    queryKey: id === undefined ? ['documents', 'build'] : documentBuildQueryKey(id),
    queryFn: async () => null,
    initialData:
      id === undefined
        ? null
        : ((queryClient.getQueryData(documentBuildQueryKey(id)) as
            | BuildDocumentResponse
            | undefined) ?? null),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDocumentBuildStreamState(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery<DocumentBuildStreamState>({
    queryKey:
      id === undefined ? ['documents', 'build-stream'] : documentBuildStreamStateQueryKey(id),
    queryFn: async () => null,
    initialData:
      id === undefined
        ? null
        : ((queryClient.getQueryData(documentBuildStreamStateQueryKey(id)) as
            | DocumentBuildStreamState
            | undefined) ?? null),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDocumentBuildEvents(
  id: string | undefined,
  onBuild?: (build: BuildDocumentResponse) => void,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (id === undefined || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(buildApiUrl(`/documents/${id}/events`), {
      withCredentials: true,
    });

    const handleMessage = (event: MessageEvent<string>): void => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const result = DocumentBuildEventSchema.safeParse(payload);
      if (!result.success) {
        return;
      }
      switch (result.data.type) {
        case 'documents.build.running': {
          queryClient.setQueryData(documentBuildStreamStateQueryKey(id), {
            kind: 'running',
            documentId: result.data.payload.documentId,
          } satisfies DocumentBuildStreamState);
          break;
        }
        case 'documents.build.failed': {
          queryClient.setQueryData(documentBuildStreamStateQueryKey(id), {
            kind: 'failed',
            documentId: result.data.payload.documentId,
            message: result.data.payload.message,
            diagnostics: result.data.payload.diagnostics,
          } satisfies DocumentBuildStreamState);
          break;
        }
        case 'documents.build.ready': {
          queryClient.setQueryData(documentBuildQueryKey(id), result.data.payload);
          queryClient.setQueryData(documentBuildStreamStateQueryKey(id), {
            kind: 'ready',
            documentId: result.data.payload.documentId,
            hash:
              result.data.payload.build.tessellation?.metadata.hash ??
              result.data.payload.build.documentHash,
          } satisfies DocumentBuildStreamState);
          onBuild?.(result.data.payload);
          break;
        }
      }
    };

    source.addEventListener('message', handleMessage as EventListener);
    return () => {
      source.removeEventListener('message', handleMessage as EventListener);
      source.close();
    };
  }, [id, onBuild, queryClient]);
}

export function buildToTessellation(build: BuildDocumentResponse): TessellationResult | null {
  if (build.build.tessellation === null) {
    return null;
  }
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

export async function downloadDocumentStl(id: string): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/documents/${id}/export/stl`), {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to export STL (${String(response.status)})`);
  }
  return response.blob();
}
