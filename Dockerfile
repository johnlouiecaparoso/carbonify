# syntax=docker/dockerfile:1
#
# Carbonify SPA — container image.
#
# Two stages: build the Vite bundle with Node, then serve the static output
# with nginx (SPA history fallback). Vite inlines VITE_* vars at BUILD time, so
# the public config must be passed as build args:
#
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://YOUR.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=... \
#     --build-arg VITE_SUPABASE_FUNCTIONS_URL=https://YOUR.functions.supabase.co \
#     -t carbonify .
#
# Only PUBLIC values belong here (anon key, URLs). Never bake a service-role key
# or any secret into the image — those live only in Supabase edge-function env.

# ── Build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Public build-time config (Vite inlines these into the bundle).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_FUNCTIONS_URL
ARG VITE_SENTRY_DSN
ARG VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_FUNCTIONS_URL=$VITE_SUPABASE_FUNCTIONS_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
