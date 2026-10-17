import { MEMBER_COLORS } from '@chalk/schema';
import type { Profile } from '../lib/profile';

export function ProfileFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  return (
    <>
      <label className="col">
        <span className="section-title">Your name</span>
        <input className="input" maxLength={32} value={value.name} autoFocus placeholder="e.g. Nika"
          onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <div className="col">
        <span className="section-title">Colour</span>
        <div className="row" role="radiogroup" aria-label="Colour">
          {MEMBER_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={c}
              className="swatch" style={{ background: c }} onClick={() => onChange({ ...value, color: c })} />
          ))}
        </div>
      </div>
    </>
  );
}
