# Сборка приложения (нужны devDependencies: nest/cli, typescript)
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# Запуск: только production-зависимости и скомпилированный dist
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/main.js"]
