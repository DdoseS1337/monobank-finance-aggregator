FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and prisma schema
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/
COPY mcc_normalization_seed.json ./
COPY merchant_rules_seed.json ./

# Generate Prisma client (reads schema only, no DB connection needed)
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./
COPY --from=base /app/package.json ./
COPY --from=base /app/mcc_normalization_seed.json ./
COPY --from=base /app/merchant_rules_seed.json ./
COPY --from=base /app/tsconfig.json ./

EXPOSE 3000

# Run migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
