FROM --platform=linux/amd64 node:18-alpine

RUN apk add git

ENV CI=true
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json .

RUN npm install --omit=dev --frozen-lockfile

COPY dist .

ARG IMAGE_VERSION
ENV SCOUT_VERSION=$IMAGE_VERSION

CMD node /app/src/main.js
