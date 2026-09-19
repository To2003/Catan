# Server image. The web app is built separately and served by Vercel.
#
# Two stages: the first installs the whole workspace and bundles the server
# (the engine is consumed by source, so it has to be compiled in), the second
# keeps only what running needs.

FROM node:24-slim AS build
WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/engine packages/engine
COPY apps/server apps/server
RUN pnpm --filter @tierra-austral/server build

# Only the server's runtime dependencies, without the workspace or the sources.
RUN pnpm --filter @tierra-austral/server deploy --prod --legacy /runtime

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /app/apps/server/build ./build

# Where the games live. Mount a volume here, or they go with the container.
ENV DB_PATH=/data/tierra-austral.db
RUN mkdir -p /data
VOLUME /data

ENV PORT=3001
EXPOSE 3001

# WEB_ORIGIN has to name the deployed front end, or the browser's CORS check
# refuses the socket.
CMD ["node", "build/index.js"]
