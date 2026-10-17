// Keyboard ownership: which focused elements must keep a shortcut key for themselves.

/** A field the user is typing into (L for the laser must not fire here). */
export const isTextEntry = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

const SPACE_CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="slider"], [role="textbox"], [role="menuitem"]';

/** Space also activates controls, so hold-Space-to-talk must leave those alone too. */
export const ownsSpace = (el: Element | null) => isTextEntry(el) || !!el?.closest(SPACE_CONTROLS);
