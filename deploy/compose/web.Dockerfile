FROM node:22-bookworm-slim AS build
WORKDIR /workspace

RUN corepack enable

ARG VITE_PREFILL_LOGIN_EMAIL=""
ARG VITE_PREFILL_LOGIN_PASSWORD=""

ENV VITE_PREFILL_LOGIN_EMAIL=${VITE_PREFILL_LOGIN_EMAIL}
ENV VITE_PREFILL_LOGIN_PASSWORD=${VITE_PREFILL_LOGIN_PASSWORD}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests
COPY deploy ./deploy
COPY .prettierrc.js eslint.config.mjs i18next.config.ts knip.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY deploy/compose/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist ./

EXPOSE 80
