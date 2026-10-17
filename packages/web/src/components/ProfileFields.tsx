// A7 (Dev A), AU: display name and colour of an account (sign-up). The colour is the ring of your
// punch on the binding, so the preview shows exactly how the class will see you.
import { useRef } from 'react';
import { MEMBER_COLORS } from '@chalk/schema';
import { Punch } from '../ui/Punch';

const COLOR_NAMES: Record<string, string> = {
  '#f2d16b': 'Straw', '#8fc7e8': 'Sky', '#a8dc9f': 'Mint', '#f4a6c8': 'Rose', '#f6b26b': 'Apricot', '#c3a6f4': 'Lilac',
};

export interface Profile { name: string; color: string }

export function ProfileFields({ value, onChange, autoFocus = true, idPrefix = 'pf', nameLabel = 'Your name', invalid }: {
  value: Profile; onChange: (p: Profile) => void; autoFocus?: boolean; idPrefix?: string; nameLabel?: string; invalid?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const pick = (i: number) => {
    const c = MEMBER_COLORS[(i + MEMBER_COLORS.length) % MEMBER_COLORS.length];
    onChange({ ...value, color: c });
    group.current?.querySelector<HTMLButtonElement>(`[data-c="${c}"]`)?.focus();
  };
  const at = Math.max(0, MEMBER_COLORS.indexOf(value.color as (typeof MEMBER_COLORS)[number]));

  return (
    <div className="profile">
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-name`}>{nameLabel}</label>
        <div className="profile-name">
          <Punch name={value.name.trim() || '?'} color={value.color} />
          <input id={`${idPrefix}-name`} className="input" maxLength={32} value={value.name} autoFocus={autoFocus} placeholder="What the class calls you"
            autoComplete="nickname" required aria-invalid={invalid || undefined} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <span className="field-label" id={`${idPrefix}-color`}>Colour <span className="field-hint">{COLOR_NAMES[value.color] ?? ''}</span></span>
        <div className="swatches" role="radiogroup" aria-labelledby={`${idPrefix}-color`} ref={group}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(at + 1); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(at - 1); }
          }}>
          {MEMBER_COLORS.map((c, i) => (
            <button key={c} type="button" role="radio" data-c={c} aria-checked={value.color === c} aria-label={COLOR_NAMES[c] ?? c}
              tabIndex={i === at ? 0 : -1} className="swatch" style={{ ['--c' as string]: c }} onClick={() => onChange({ ...value, color: c })} />
          ))}
        </div>
      </div>
    </div>
  );
}
