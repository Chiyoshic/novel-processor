FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
