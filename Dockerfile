# The API, for Railway.
#
# Railway uses this file whenever it is at the repo root, instead of guessing
# how to build the repo. Guessing goes wrong here: the repo also contains a
# Vite app, so Railway's builder serves the frontend as a static site and the
# API never starts. The frontend is Cloudflare Pages' job, not this image's.
#
# Only production dependencies are installed, so nothing is built: the API is
# plain Node and runs its source directly.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# Every workspace's package.json has to be present for `npm ci` to accept the
# lockfile, even though only shared/ and backend/ are copied in full below.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --no-audit --no-fund

COPY shared/ shared/
COPY backend/ backend/

# Railway sets PORT. Migrations run on boot, before the server listens.
USER node
CMD ["node", "backend/src/server.mjs"]
