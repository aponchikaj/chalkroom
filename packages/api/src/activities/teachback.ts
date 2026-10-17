// Lane M: the teach-back as a plain, timer-driven sequence (testable with fake timers).
//
//   teachback_invite -> first volunteer: teachback_volunteer -> their text: teachback_explanation
//   -> the tutor's critique: teachback_feedback (+ its Board Script as a `board` event)
//
// Nobody volunteers within 60 s, or the volunteer writes nothing within 3 min: a notice, and it ends.
import type { BoardStep, StreamEventDataOf } from '@chalk/schema';

export const TEACHBACK = { volunteerMs: 60_000, explainMs: 180_000 };

type Kind = 'teachback_invite' | 'teachback_volunteer' | 'teachback_explanation' | 'teachback_feedback' | 'notice' | 'board';

export interface TeachbackDeps {
  emit: <K extends Kind>(kind: K, data: StreamEventDataOf<K>, actor?: string) => Promise<void>;
  /** the tutor's critique (model call) */
  critique: (name: string, text: string) => Promise<{ markdown: string; missing: string[]; steps?: BoardStep[] }>;
}

export class TeachbackRun {
  private volunteer: { userId: string; name: string } | null = null;
  private explained = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private finish!: () => void;
  /** resolves when the teach-back is over (feedback written or timed out) */
  readonly done: Promise<void>;

  constructor(readonly id: string, readonly concept: string, private deps: TeachbackDeps) {
    this.done = new Promise((r) => { this.finish = r; });
  }

  get volunteerId() { return this.volunteer?.userId ?? null; }

  async start() {
    await this.deps.emit('teachback_invite', {
      teachbackId: this.id, concept: this.concept,
      prompt: 'Who can explain this to the class in their own words? The tutor adds what is missing.',
    }, 'lead');
    this.arm(TEACHBACK.volunteerMs, 'Nobody volunteered for the teach-back this time.');
  }

  /** First caller wins. Returns false when someone already volunteered. */
  async volunteerAs(userId: string, name: string): Promise<boolean> {
    if (this.volunteer) return false;
    this.volunteer = { userId, name };
    this.arm(TEACHBACK.explainMs, `${name} did not send an explanation in time, so the teach-back ended.`);
    await this.deps.emit('teachback_volunteer', { teachbackId: this.id, userId, name }, userId);
    return true;
  }

  /** The volunteer's explanation. Returns an error word, or null when accepted. */
  async explain(userId: string, text: string): Promise<'not_volunteer' | 'twice' | null> {
    if (!this.volunteer || this.volunteer.userId !== userId) return 'not_volunteer';
    if (this.explained) return 'twice';
    this.explained = true;
    this.clear();
    const { name } = this.volunteer;
    await this.deps.emit('teachback_explanation', { teachbackId: this.id, userId, name, text }, userId);
    // the critique runs after the request returns; the activity stays busy until it lands
    void this.respond(name, text);
    return null;
  }

  private async respond(name: string, text: string) {
    try {
      const fb = await this.deps.critique(name, text);
      await this.deps.emit('teachback_feedback', { teachbackId: this.id, markdown: fb.markdown, missing: fb.missing, ...(fb.steps?.length ? { steps: fb.steps } : {}) }, 'lead');
      // the main board player draws `board` events: the tutor shows the missing piece
      if (fb.steps?.length) await this.deps.emit('board', { steps: fb.steps }, 'lead');
    } catch {
      await this.deps.emit('notice', { text: 'The tutor could not respond to the teach-back. Thanks for explaining!', level: 'warn' }, 'system').catch(() => undefined);
    } finally {
      this.finish();
    }
  }

  /** End now (the class moved on). */
  cancel() { this.clear(); this.finish(); }

  private arm(ms: number, text: string) {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.deps.emit('notice', { text, level: 'info' }, 'system').catch(() => undefined).finally(() => this.finish());
    }, ms);
  }

  private clear() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
}
