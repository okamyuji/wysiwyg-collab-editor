FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/export-worker apps/export-worker
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/export-worker exec playwright install --with-deps chromium
RUN pnpm --filter ./apps/export-worker build
USER node
CMD ["node", "apps/export-worker/dist/main.js"]
