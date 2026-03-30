# Mekong AI — API server (Node.js)
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk add --no-cache wget

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server/serverMain.js"]
