// EmbeddingPort: the one door to an embedding model (RAG, B12). Anthropic has no embeddings
// API; the planned adapter is Voyage AI (voyage-3.5 family, 1024 dimensions, matching
// chunks.embedding). NoEmbeddings returns nulls, and retrieval falls back to full-text search,
// so RAG works with no key and no network.

export const EMBEDDING_DIMS = 1024;

/** `document` when indexing chunks, `query` when searching (providers embed them differently). */
export type EmbedKind = 'document' | 'query';

export abstract class EmbeddingPort {
  abstract readonly name: string;
  /** One vector per input, in order, each EMBEDDING_DIMS long; null when this adapter has none. */
  abstract embed(texts: string[], kind: EmbedKind): Promise<(number[] | null)[]>;
}
