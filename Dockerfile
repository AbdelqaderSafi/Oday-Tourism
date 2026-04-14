FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies for native modules (argon2)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install ALL dependencies (including devDependencies needed for build)
COPY package*.json ./
RUN npm ci --include=dev

# Copy source and build
COPY . .

# 1. Generate Prisma client
RUN npx prisma generate

# 2. Ensure source package.json files exist for tsc ESM detection
RUN echo '{"type":"module"}' > generated/prisma/package.json \
    && echo '{"type":"module"}' > generated/prisma/internal/package.json

# 3. Build NestJS
RUN npx nest build

# 4. Ensure runtime package.json for Node ESM resolution
RUN mkdir -p dist/generated/prisma/internal \
    && echo '{"type":"module"}' > dist/generated/prisma/package.json \
    && echo '{"type":"module"}' > dist/generated/prisma/internal/package.json

# ---- Production image ----
FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.mjs ./prisma.config.mjs

ENV NODE_ENV=production

EXPOSE 3000

CMD npx prisma migrate resolve --rolled-back 20260414000000_add_meal_plan_to_hotels 2>/dev/null || true && npx prisma migrate deploy && node dist/src/main
