// No embedding provider: every vector is null. match_chunks() then ranks by full text only.
import { EmbeddingPort, type EmbedKind } from './embedding.port';

export class NoEmbeddings extends EmbeddingPort {
  readonly name = 'none';
  async embed(texts: string[], _kind: EmbedKind): Promise<null[]> {
    return texts.map(() => null);
  }
}
