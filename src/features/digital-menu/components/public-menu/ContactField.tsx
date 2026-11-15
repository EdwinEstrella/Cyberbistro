export interface ContactFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  type?: "text" | "tel" | "url" | "email";
  maxLength?: number;
  autoComplete?: string;
  error?: string;
  helperText?: string;
}

export function ContactField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  autoComplete,
  error,
  helperText,
}: ContactFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        maxLength={maxLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-xl bg-muted/50 border text-foreground text-xs focus:outline-none focus:border-primary ${
          error ? "border-destructive text-destructive" : "border-border"
        }`}
      />
      {helperText && (
        <span className="text-[11px] text-muted-foreground">{helperText}</span>
      )}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
