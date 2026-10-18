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

# bake the server voice too (Kokoro-82M fp32, ~330 MB, TTS=kokoro in fly.toml). kokoro-js brings its
# own @huggingface/transformers (v3), so the cache dir is set on that copy, as src/tts/kokoro.worker.mjs does
ENV TTS_CACHE=/app/.models
ENV TTS_DTYPE=fp32
RUN cd packages/api && node --input-type=module -e "import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; const r = createRequire(process.cwd() + '/package.json'); const tf = await import(pathToFileURL(createRequire(r.resolve('kokoro-js')).resolve('@huggingface/transformers').replace(/\.cjs$/, '.mjs')).href); tf.env.cacheDir = process.env.TTS_CACHE; const { KokoroTTS } = await import('kokoro-js'); await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: process.env.TTS_DTYPE, device: 'cpu' });"

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/packages/api
CMD ["npm", "start"]
