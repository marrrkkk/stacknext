# syntax=docker/dockerfile:1.7

# Build the real workspace packages, then deploy only the CLI runtime graph.
FROM node:24-alpine AS builder

RUN npm install --global pnpm@12.16.1

WORKDIR /repo
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/example-next-app/package.json ./apps/example-next-app/package.json

RUN pnpm install --frozen-lockfile \
      --filter @stacknext/cli... \
      --filter @stacknext/dashboard \
      --filter .

RUN pnpm --filter @stacknext/cli... build

# pnpm deploy copies built workspace packages and production dependencies into
# a self-contained directory. The absolute workspace paths in package metadata
# are not used at runtime.
RUN pnpm --filter @stacknext/cli deploy --prod /out \
    && rm -f /out/pnpm-lock.yaml /out/pnpm-workspace.yaml

FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.title="StackNext collector" \
      org.opencontainers.image.description="Local-first StackNext collector and dashboard" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /out ./

USER node
EXPOSE 4400
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4400/api/ping').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["node", "dist/docker-entrypoint.js"]
