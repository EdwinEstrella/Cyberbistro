import { escapeHtml } from "./escapeHtml.ts";
import { isValidEmail } from "./isValidEmail.ts";

export const DEFAULT_SENDER_EMAIL = "sugerencias@mail.azokia.com";

export interface BuildEmailParams {
  businessName?: string | null;
  recipient: string;
  message: string;
  contact?: string | null;
  mesaNumero?: number | null;
  createdAt: string | Date | number;
}

export interface EmailPayload {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Formats a timestamp into Dominican Republic local time (America/Santo_Domingo, UTC-4).
 */
export function formatDominicanDate(dateInput: string | Date | number): string {
  const date = typeof dateInput === "object" && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/**
 * Builds the plain text and escaped HTML email payload for Resend.
 * Enforces:
 * - Sender: sugerencias@mail.azokia.com
 * - Subject: "Nueva sugerencia - <business name>" (or "Nueva sugerencia" if business name is empty)
 * - Reply-To: included only when contact is a valid email
 * - All user text strictly escaped in HTML
 * - Dominican Republic local time formatting
 */
export function buildEmail(params: BuildEmailParams): EmailPayload {
  const businessName = params.businessName?.trim() || "";
  const subject = businessName ? `Nueva sugerencia - ${businessName}` : "Nueva sugerencia";
  const formattedDate = formatDominicanDate(params.createdAt);

  const mesaLabel = typeof params.mesaNumero === "number" && params.mesaNumero > 0
    ? `Mesa ${params.mesaNumero}`
    : "Sin mesa (pedido digital o para llevar)";

  const rawContact = params.contact?.trim() || "";
  const contactLabel = rawContact || "No proporcionado";

  // Reply-To only when the customer's contact looks like a valid email
  const replyTo = rawContact && isValidEmail(rawContact) ? rawContact : undefined;

  const rawMessage = params.message.trim();

  // Plain-text body
  const text = [
    `Nueva sugerencia recibida${businessName ? ` para ${businessName}` : ""}:`,
    "",
    "Mensaje:",
    rawMessage,
    "",
    "Detalles:",
    `- Mesa: ${mesaLabel}`,
    `- Contacto: ${contactLabel}`,
    `- Fecha y hora (Rep. Dominicana): ${formattedDate}`,
    "",
    "---",
    "Mensaje enviado automáticamente desde el menú digital de tu restaurante.",
  ].join("\n");

  // Escaped values for HTML
  const safeSubject = escapeHtml(subject);
  const safeBusinessName = escapeHtml(businessName || "tu negocio");
  const safeMessage = escapeHtml(rawMessage);
  const safeMesaLabel = escapeHtml(mesaLabel);
  const safeContactLabel = escapeHtml(contactLabel);
  const safeDate = escapeHtml(formattedDate);

  // Simple, robust HTML body with all user input escaped
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 24px; color: #18181b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7; overflow: hidden;">
    <div style="background-color: #18181b; padding: 20px 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #ffffff;">Nueva sugerencia recibida</h2>
      <p style="margin: 4px 0 0; font-size: 14px; color: #a1a1aa;">${safeBusinessName}</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 10px; font-size: 13px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Mensaje del cliente</p>
      <div style="background-color: #fafafa; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 4px; font-size: 15px; line-height: 1.6; color: #18181b; white-space: pre-wrap; word-break: break-word;">${safeMessage}</div>

      <div style="margin-top: 24px; border-top: 1px solid #e4e4e7; padding-top: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #71717a; width: 140px; vertical-align: top;"><strong>Mesa:</strong></td>
            <td style="padding: 6px 0; color: #18181b;">${safeMesaLabel}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #71717a; vertical-align: top;"><strong>Contacto:</strong></td>
            <td style="padding: 6px 0; color: #18181b;">${safeContactLabel}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #71717a; vertical-align: top;"><strong>Fecha (Rep. Dom.):</strong></td>
            <td style="padding: 6px 0; color: #18181b;">${safeDate}</td>
          </tr>
        </table>
      </div>
    </div>
    <div style="background-color: #fafafa; padding: 12px 24px; border-top: 1px solid #e4e4e7; text-align: center; font-size: 12px; color: #a1a1aa;">
      Enviado automáticamente desde el menú digital de ${safeBusinessName}.
    </div>
  </div>
</body>
</html>`;

  const payload: EmailPayload = {
    from: DEFAULT_SENDER_EMAIL,
    to: [params.recipient.trim()],
    subject,
    text,
    html,
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  return payload;
}
