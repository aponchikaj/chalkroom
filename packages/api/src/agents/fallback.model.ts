// FallbackModel: answers from a second model (the mock tutor) when the first one fails.
import { ModelPort, type ModelEvent, type ModelRequest } from './model.port';

/** Try the primary model; if it fails before producing anything, answer from the fallback. */
export class FallbackModel extends ModelPort {
  readonly name: string;
  constructor(private primary: ModelPort, private fallback: ModelPort, private log: (m: string) => void) {
    super();
    this.name = `${primary.name}→${fallback.name}`;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    let produced = false;
    try {
      for await (const e of this.primary.stream(req)) {
        // on a live stream partial tool JSON counts: falling back after it would replay a whole
        // mock answer on top. A plain call() shows nothing until the end, so it can fall back.
        if (req.streamed && (e.type === 'tool' || e.type === 'tool_delta')) produced = true;
        yield e;
      }
      return;
    } catch (err) {
      if (produced) throw err;
      this.log(`${req.agent}: ${this.primary.name} failed (${(err as Error).message}); using ${this.fallback.name}`);
    }
    yield* this.fallback.stream(req);
  }
}
