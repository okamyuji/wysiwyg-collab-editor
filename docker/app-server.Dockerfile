FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/server apps/server
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/server build

FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
USER nonroot:nonroot
EXPOSE 3000
CMD ["dist/main.js"]
