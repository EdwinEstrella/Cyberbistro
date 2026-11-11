import { UrlCopyField } from "./UrlCopyField";

interface ReceptorUrlFieldsProps {
  portalField: string;
  onCopied: (message: string) => void;
}

const URL_FIELDS = [
  { label: "SERVICIO DE AUTENTICACIÓN", target: "Autenticación" },
  { label: "SERVICIO DE RECEPCIÓN *", target: "Recepción" },
  { label: "SERVICIO DE APROBACIÓN COMERCIAL *", target: "Aprobación Comercial" },
] as const;

export function ReceptorUrlFields({ portalField, onCopied }: ReceptorUrlFieldsProps) {
  function handleCopy(value: string, target: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
    onCopied(`Copiado: pegalo en el campo de ${target} del portal DGII (sin https:// ni /fe/...).`);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      {URL_FIELDS.map(({ label, target }) => (
        <UrlCopyField
          key={label}
          label={label}
          field={portalField}
          onCopy={(value) => handleCopy(value, target)}
        />
      ))}
    </div>
  );
}
