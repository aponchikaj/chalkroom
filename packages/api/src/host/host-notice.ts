// Lane C: the class notice each host control posts, so nobody wonders why the tutor went quiet,
// slowed down or moved on. Pure, so the wording is tested without a database.
import type { StreamEventDataOf } from '@chalk/schema';

export type HostControl = NonNullable<StreamEventDataOf<'notice'>['control']>;

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

/** The notice text for a host control. `host` is the host's display name; `what` names the
 *  figure (re-explain) or the question group (pin). */
export function hostNotice(control: HostControl, host: string, what?: string): StreamEventDataOf<'notice'> {
  const who = host.trim() || 'The host';
  const thing = what?.trim() ? `"${clip(what.trim())}"` : null;
  const text = {
    pause: `${who} paused the tutor. The board waits until they resume.`,
    resume: `${who} resumed the tutor.`,
    slower: `${who} asked for a slower pace. The next part re-explains before it moves on.`,
    skip: `${who} moved the class on to the next part.`,
    reexplain: thing ? `${who} asked the tutor to re-explain ${thing} in the next Q&A.` : `${who} asked the tutor to re-explain a figure in the next Q&A.`,
    pin: thing ? `${who} pinned ${thing} to the next Q&A.` : `${who} pinned a question to the next Q&A.`,
  }[control];
  return { text, level: 'info', control };
}
