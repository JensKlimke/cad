FROM node:22-bookworm-slim AS runtime
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

CMD ["pnpm", "--filter", "@cad/db", "migrate"]
