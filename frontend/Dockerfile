
# Stage 1: Node.js Build
# Node.js v26.4.0 (Alpine)
FROM node:26.4.0-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS build
WORKDIR /app
COPY frontend/app/package*.json ./
RUN npm ci
COPY frontend/app/ .
RUN npm run build

# Stage 2: Nginx Production
# Nginx 1.31 (Alpine, Unprivileged)
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:592b23aa79a6e6c08ba4b20f1fff700e1328895705966722608e115d62e52d39 AS production
COPY nginx/nginx.conf /etc/nginx/nginx.conf

RUN mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi && \
    chown -R nginx:nginx /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi && \
    chmod -R 777 /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi

COPY nginx/proxy_params /etc/nginx/proxy_params
COPY --from=build /app/dist /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 8080 8443