// Local embeddings: multilingual-e5-small through @huggingface/transformers (ONNX on the CPU).
// No key and no per-call cost; the model (~120 MB, quantized) downloads once into the cache
// directory and loads in ~10 s, so the API warms it at boot. A query takes a few ms.
// e5 expects "query: " and "passage: " prefixes; vectors are mean-pooled and normalized, so
// cosine distance in match_chunks() is a plain dot product.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { EmbeddingPort, type EmbedKind } from './embedding.port';

/** The slice of a transformers.js feature-extraction pipeline this adapter uses. */
export type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

export const LOCAL_MODEL = 'Xenova/multilingual-e5-small';

/** Loads the real model; tests pass their own loader. */
export async function loadE5(model = LOCAL_MODEL, cacheDir = process.env.EMBEDDING_CACHE ?? join(homedir(), '.cache', 'chalkroom-models')): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  return (await pipeline('feature-extraction', model, { dtype: 'q8' })) as unknown as Extractor;
}

const PREFIX: Record<EmbedKind, string> = { query: 'query: ', document: 'passage: ' };

export class LocalEmbeddings extends EmbeddingPort {
  readonly name = 'local';
  private readonly log = new Logger('Embeddings');
  private extractor?: Promise<Extractor>;

  constructor(private load: () => Promise<Extractor> = () => loadE5(), private batch = 32) {
    super();
  }

  /** Load the model now (boot), so the first search does not wait for it. */
  async warm(): Promise<void> {
    await this.model();
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    if (!texts.length) return [];
    const run = await this.model();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const slice = texts.slice(i, i + this.batch).map((t) => PREFIX[kind] + t);
      out.push(...(await run(slice, { pooling: 'mean', normalize: true })).tolist());
    }
    return out;
  }

  private model(): Promise<Extractor> {
    if (!this.extractor) {
      const t0 = Date.now();
      this.extractor = this.load().then(
        (m) => { this.log.log(`${LOCAL_MODEL} ready in ${Date.now() - t0} ms`); return m; },
        (e) => { this.extractor = undefined; throw e; },
      );
    }
    return this.extractor;
  }
}
