FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund --loglevel=info

COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
