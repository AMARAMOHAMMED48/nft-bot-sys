FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/bot-core/package.json ./apps/bot-core/
COPY apps/bot-discord/package.json ./apps/bot-discord/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm install --include=dev

COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && npx prisma generate

COPY apps/api ./apps/api

EXPOSE 4000

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node index.js"]
