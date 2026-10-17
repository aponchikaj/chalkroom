// EmbeddingPort: the one door to an embedding model (RAG, B12). Neither Groq nor Anthropic has
// an embeddings API, so LocalEmbeddings runs multilingual-e5-small inside the API (384
// dimensions, matching chunks.embedding; English and Georgian). NoEmbeddings returns nulls, and
// retrieval falls back to full-text search, so RAG also works with EMBEDDINGS=none.

export const EMBEDDING_DIMS = 384;

/** `document` when indexing chunks, `query` when searching (providers embed them differently). */
export type EmbedKind = 'document' | 'query';

export abstract class EmbeddingPort {
  abstract readonly name: string;
  /** One vector per input, in order, each EMBEDDING_DIMS long; null when this adapter has none. */
  abstract embed(texts: string[], kind: EmbedKind): Promise<(number[] | null)[]>;
}
