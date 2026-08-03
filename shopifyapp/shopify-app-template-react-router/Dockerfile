FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate
RUN pnpm run build

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["pnpm", "run", "docker-start"]
