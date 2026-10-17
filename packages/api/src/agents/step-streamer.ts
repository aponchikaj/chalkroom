// packages/api/src/agents/step-streamer.ts
// Pulls each complete element of the top-level "steps" array out of a tool input that arrives
// as partial JSON (ModelEvent.tool_delta). A tiny scanner: strings, escapes and nesting depth.
export class StepStreamer {
  private buf = '';
  private i = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private strStart = -1;
  /** last string closed at depth 1: the current key of the top-level object */
  private key = '';
  private inSteps = false;
  private elStart = -1;

  push(chunk: string): unknown[] {
    this.buf += chunk;
    const out: unknown[] = [];
    for (; this.i < this.buf.length; this.i++) {
      const ch = this.buf[this.i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') {
          this.inString = false;
          if (this.depth === 1) this.key = this.buf.slice(this.strStart + 1, this.i);
        }
        continue;
      }
      if (ch === '"') { this.inString = true; this.strStart = this.i; continue; }
      if (ch === '{' || ch === '[') {
        this.depth++;
        if (ch === '[' && this.depth === 2 && this.key === 'steps') this.inSteps = true;
        else if (this.inSteps && this.depth === 3) this.elStart = this.i;
      } else if (ch === '}' || ch === ']') {
        if (this.inSteps && this.depth === 3 && this.elStart >= 0) {
          try { out.push(JSON.parse(this.buf.slice(this.elStart, this.i + 1))); } catch { /* the final input decides */ }
          this.elStart = -1;
        } else if (ch === ']' && this.inSteps && this.depth === 2) this.inSteps = false;
        this.depth--;
      }
    }
    return out;
  }
}
