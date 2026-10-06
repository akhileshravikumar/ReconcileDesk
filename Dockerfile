FROM node:24-bookworm-slim AS node-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run generate && npm run build

FROM node-build AS api
ENV NODE_ENV=development
RUN chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM nginx:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=node-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
