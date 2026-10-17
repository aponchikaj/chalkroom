// Section hues for lesson segments, in divider-tab order, each with the label ink that keeps
// small text at 4.5:1 on it. Chrome yellow is the action ink and vermilion the errata slip, so
// neither is ever a section hue.
export const SECTION_HUES = [
  { hue: '--h-orange', on: 'var(--ink)' },
  { hue: '--h-teal', on: '#ffffff' },
  { hue: '--h-grass', on: '#ffffff' },
  { hue: '--h-ultra', on: '#ffffff' },
  { hue: '--h-violet', on: '#ffffff' },
  { hue: '--h-sienna', on: '#ffffff' },
] as const;

const at = (i: number) => SECTION_HUES[((i % SECTION_HUES.length) + SECTION_HUES.length) % SECTION_HUES.length];

/** CSS color for segment i, e.g. `var(--h-teal)`. */
export const sectionHue = (i: number) => `var(${at(i).hue})`;
/** Label ink on segment i's hue. */
export const sectionInk = (i: number) => at(i).on;
