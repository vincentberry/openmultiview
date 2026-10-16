FROM node:22-alpine AS build
WORKDIR /app
COPY . .
ARG PUBLIC_URL=https://vincentberry.github.io/openmultiview/
ENV PUBLIC_URL=$PUBLIC_URL
RUN node scripts/build-public.cjs

FROM nginx:stable-alpine

COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
