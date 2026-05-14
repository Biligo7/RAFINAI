# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine AS runtime

# The Nginx entrypoint substitutes ${BACKEND_BASE_URL} into the template at
# container start time, so the frontend image is environment-agnostic.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_BASE_URL=http://backend:3000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
