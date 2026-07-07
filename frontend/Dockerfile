FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/app/package*.json ./
RUN npm install
COPY frontend/app/ .
RUN npm run build

FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/proxy_params /etc/nginx/proxy_params
COPY --from=build /app/dist /usr/share/nginx/html
