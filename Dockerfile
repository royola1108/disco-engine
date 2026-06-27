# ---- builder ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DISCO_DB=/app/data/disco.db
ENV DISCO_SAVES=/app/data/saves
ENV DISCO_PORT=3000
ENV DISCO_MODE=both

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY src/web/public ./dist/web/public

RUN mkdir -p data/saves

EXPOSE 3000
CMD ["node", "dist/index.js"]
