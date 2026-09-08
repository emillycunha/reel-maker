const safeColor = (value: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function ColorControl({ label, value, onChange }: Props) {
  return (
    <label>
      {label}
      <span className="color-input-row">
        <input
          aria-label={`${label} picker`}
          type="color"
          value={safeColor(value)}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={label}
          type="text"
          value={value}
          placeholder="#rrggbb"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}
