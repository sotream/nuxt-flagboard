# Build from the repository root: docker build -f apps/api/Dockerfile -t flagboard-api .
# The image holds the compiled API only. It carries no migration tooling: schema changes run with the migrator
# role (`pnpm db:migrate`), never from the running container, which only has the data-access role.

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
RUN corepack enable
WORKDIR /repo

# Manifests first, so the dependency layer is reused until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter api...

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @flagboard/core build && pnpm --filter api build
# Only what the running API needs: compiled code and production dependencies.
RUN pnpm --filter api deploy --prod --legacy /out

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4010)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
