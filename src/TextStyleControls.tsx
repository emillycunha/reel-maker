type FontPickerProps = {
  label?: string;
  fonts: readonly string[];
  value: string;
  onChange: (font: string) => void;
};

export function FontPicker({
  label = "Font",
  fonts,
  value,
  onChange,
}: FontPickerProps) {
  return (
    <div className="font-picker" role="group" aria-label={label}>
      <span className="control-label">{label}</span>
      <div className="presets font-presets">
        {fonts.map((font) => (
          <button
            type="button"
            key={font}
            className={value === font ? "selected" : ""}
            aria-pressed={value === font}
            onClick={() => onChange(font)}
          >
            <span className="preset-sample" style={{ fontFamily: font }}>
              Aa
            </span>
            <small>{font}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

type TextSizeColorProps = {
  size: number;
  color: string;
  min: number;
  max: number;
  sizeLabel?: string;
  colorLabel?: string;
  onSize: (size: number) => void;
  onColor: (color: string) => void;
};

export function TextSizeColor({
  size,
  color,
  min,
  max,
  sizeLabel = "Size",
  colorLabel = "Text color",
  onSize,
  onColor,
}: TextSizeColorProps) {
  return (
    <div className="two-cols text-style-pair">
      <label>
        {sizeLabel}
        <div className="unit-input">
          <input
            aria-label={sizeLabel}
            type="number"
            min={min}
            max={max}
            value={size}
            onChange={(event) =>
              onSize(Math.max(min, Math.min(max, +event.target.value)))
            }
          />
          <span>px</span>
        </div>
      </label>
      <label>
        {colorLabel}
        <div className="color-input">
          <input
            aria-label={colorLabel}
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"}
            onChange={(event) => onColor(event.target.value)}
          />
          <span>{color.toUpperCase()}</span>
        </div>
      </label>
    </div>
  );
}
