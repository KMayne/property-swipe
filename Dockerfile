FROM node:14 AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV="production"
USER node
EXPOSE 3000
CMD ["node", "/app/src/server.js"]
