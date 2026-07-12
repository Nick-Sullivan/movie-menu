import { secsToHms, hmsToSecs } from '../utils';

interface Props {
  value: number;
  onChange: (secs: number) => void;
  required?: boolean;
  autoFocus?: boolean;
}

export default function HmsInput({ value, onChange, required, autoFocus }: Props) {
  const { h, m, s } = secsToHms(value);

  function update(field: 'h' | 'm' | 's', raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    const next = { h, m, s, [field]: n };
    onChange(hmsToSecs(next.h, next.m, next.s));
  }

  return (
    <div className="hms-input">
      <input
        type="text" inputMode="numeric"
        value={h}
        onChange={e => update('h', e.target.value)}
        onFocus={e => e.target.select()}
        required={required}
        autoFocus={autoFocus}
        aria-label="hours"
      />
      <span className="hms-sep">:</span>
      <input
        type="text" inputMode="numeric"
        value={m}
        onChange={e => update('m', e.target.value)}
        onFocus={e => e.target.select()}
        required={required}
        aria-label="minutes"
      />
      <span className="hms-sep">:</span>
      <input
        type="text" inputMode="numeric"
        value={s}
        onChange={e => update('s', e.target.value)}
        onFocus={e => e.target.select()}
        required={required}
        aria-label="seconds"
      />
    </div>
  );
}
