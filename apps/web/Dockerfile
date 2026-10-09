# Build from the repository root: docker build -f apps/web/Dockerfile -t flagboard-web .
# The image is nginx serving the static site (`nuxt generate`) and proxying /api/ and /v1/ to the API, so the
# browser sees one origin. Set API_UPSTREAM at run time, for example http://api:4010.

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter web...

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @flagboard/core build && pnpm --filter web build
# Fill the Content-Security-Policy with the hashes of the inline scripts Nuxt just generated.
RUN node apps/web/docker/render-nginx-conf.ts apps/web/.output/public apps/web/docker/default.conf.template /default.conf.template

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
ENV API_UPSTREAM=http://api:4010
COPY --from=build /default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/.output/public /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
