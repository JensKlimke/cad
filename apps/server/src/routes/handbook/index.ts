import { forSdkOp, getPage, listTopics, search } from '@cad/handbook';
import {
  HandbookByOpParamsSchema,
  HandbookListQuerySchema,
  HandbookListResponseSchema,
  HandbookPageParamsSchema,
  HandbookPageSchema,
  HandbookSearchQuerySchema,
  HandbookSearchResponseSchema,
} from '@cad/protocol';

import { notFound, unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const handbookRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/handbook/search',
    {
      schema: {
        querystring: HandbookSearchQuerySchema,
        response: { 200: HandbookSearchResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const items = await search(request.query.q, {
        ...(request.query.locale === undefined ? {} : { locale: request.query.locale }),
        ...(request.query.kind === undefined ? {} : { kind: request.query.kind }),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { items };
    },
  );

  fastify.get(
    '/handbook/list',
    {
      schema: {
        querystring: HandbookListQuerySchema,
        response: { 200: HandbookListResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const items = await listTopics({
        ...(request.query.locale === undefined ? {} : { locale: request.query.locale }),
        ...(request.query.kind === undefined ? {} : { kind: request.query.kind }),
      });
      return { items };
    },
  );

  fastify.get(
    '/handbook/pages/:kind/:slug',
    {
      schema: {
        params: HandbookPageParamsSchema,
        querystring: HandbookListQuerySchema.pick({ locale: true }),
        response: { 200: HandbookPageSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const page = await getPage(`/handbook/${request.params.kind}/${request.params.slug}`, {
        ...(request.query.locale === undefined ? {} : { locale: request.query.locale }),
      });
      if (page === null) {
        throw notFound('handbook_page');
      }
      return page;
    },
  );

  fastify.get(
    '/handbook/sdk/:opId',
    {
      schema: {
        params: HandbookByOpParamsSchema,
        querystring: HandbookListQuerySchema.pick({ locale: true }),
        response: { 200: HandbookPageSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const page = await forSdkOp(request.params.opId, {
        ...(request.query.locale === undefined ? {} : { locale: request.query.locale }),
      });
      if (page === null) {
        throw notFound('handbook_page');
      }
      return page;
    },
  );
};
