import { type DocumentBuildEvent } from '@cad/protocol';
import fp from 'fastify-plugin';

import type { FastifyPluginAsync } from 'fastify';

type DocumentBuildListener = (event: DocumentBuildEvent) => void;

export interface DocumentEventsService {
  publish(event: DocumentBuildEvent): void;
  subscribe(documentId: string, listener: DocumentBuildListener): () => void;
}

declare module 'fastify' {
  interface FastifyInstance {
    documentEvents: DocumentEventsService;
  }
}

const documentEventsPlugin: FastifyPluginAsync = async (fastify) => {
  const listeners = new Map<string, Set<DocumentBuildListener>>();

  fastify.decorate('documentEvents', {
    publish(event) {
      const subscribers = listeners.get(eventDocumentId(event));
      if (subscribers === undefined) {
        return;
      }
      for (const listener of subscribers) {
        listener(event);
      }
    },
    subscribe(documentId, listener) {
      const subscribers = listeners.get(documentId) ?? new Set<DocumentBuildListener>();
      subscribers.add(listener);
      listeners.set(documentId, subscribers);

      return () => {
        const current = listeners.get(documentId);
        if (current === undefined) {
          return;
        }
        current.delete(listener);
        if (current.size === 0) {
          listeners.delete(documentId);
        }
      };
    },
} satisfies DocumentEventsService);
};

export default fp(documentEventsPlugin, {
  name: 'cad-document-events',
});

function eventDocumentId(event: DocumentBuildEvent): string {
  return event.payload.documentId;
}
