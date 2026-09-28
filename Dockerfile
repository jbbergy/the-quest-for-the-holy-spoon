FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY server/package.json server/tsconfig.json server/
RUN npm ci --workspace server --omit=dev --no-audit --no-fund

COPY src src
COPY server/src server/src

USER node
WORKDIR /app/server
EXPOSE 4319
CMD ["node", "--import", "tsx", "src/main.ts"]
