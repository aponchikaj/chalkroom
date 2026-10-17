# API image (Fly.io; any Docker host works). Runs the TypeScript sources through @swc-node, the
# same way `npm start -w @chalk/api` does locally. The web app is not in this image (Vercel).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# install only what the API workspace needs (plus its workspace packages)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/api/package.json packages/api/
COPY packages/schema/package.json packages/schema/
COPY packages/board/package.json packages/board/
COPY packages/mock-tutor/package.json packages/mock-tutor/
COPY packages/web/package.json packages/web/
RUN npm ci -w @chalk/api --include=dev --no-audit --no-fund

COPY packages/api packages/api
COPY packages/schema packages/schema
COPY packages/board packages/board
COPY packages/mock-tutor packages/mock-tutor

# bake the local embeddings model (multilingual-e5-small, ~120 MB, free) into the image so a
# fresh machine does not download it at boot
ENV EMBEDDING_CACHE=/app/.models
RUN cd packages/api && node -e "import('@huggingface/transformers').then(async ({ pipeline, env }) => { env.cacheDir = process.env.EMBEDDING_CACHE; await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' }); })"

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/packages/api
CMD ["npm", "start"]
