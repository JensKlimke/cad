FROM node:22-bookworm-slim AS build
WORKDIR /workspace

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests
COPY deploy ./deploy
COPY .prettierrc.js eslint.config.mjs i18next.config.ts knip.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /workspace

ENV NODE_ENV=production

COPY --from=build /workspace /workspace

EXPOSE 8080

CMD ["node", "apps/server/dist/index.js"]
