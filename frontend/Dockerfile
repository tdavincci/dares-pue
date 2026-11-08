FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
# PORT: Railway and similar hosts inject their own. BACKEND_URL: where /api is forwarded
# (docker-compose service by default; on Railway the portal calls the API URL from environment.ts directly).
ENV PORT=80 \
    BACKEND_URL=http://backend:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
