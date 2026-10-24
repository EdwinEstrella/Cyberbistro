import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { Textarea } from "../../../shared/ui/textarea";
import { CREDIT_NOTE_REASON_MAX_LENGTH, validateCreditNoteReason } from "../lib/creditNoteErrors";
import { formatRd } from "../lib/formatRd";

interface IssueCreditNoteDialogProps {
  open: boolean;
  ncf: string;
  total: number;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function IssueCreditNoteDialog({ open, ncf, total, submitting, error, onCancel, onConfirm }: IssueCreditNoteDialogProps) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const validation = validateCreditNoteReason(reason);

  const submit = () => {
    setTouched(true);
    if (validation.ok) onConfirm(validation.value);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir nota de crédito</DialogTitle>
          <DialogDescription>Se anula la factura completa y se envía una nota de crédito (E34) a la DGII.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <dt className="text-muted-foreground">Factura original</dt>
          <dd className="text-right font-semibold">{ncf}</dd>
          <dt className="text-muted-foreground">Total a devolver</dt>
          <dd className="text-right font-semibold tabular-nums">{formatRd(total)}</dd>
        </dl>
        <p className="text-sm text-muted-foreground">El dinero sale de la caja del turno actual.</p>
        <div className="flex flex-col gap-1">
          <label htmlFor="credit-note-reason" className="text-sm font-semibold">Motivo</label>
          <Textarea
            id="credit-note-reason"
            value={reason}
            maxLength={CREDIT_NOTE_REASON_MAX_LENGTH + 20}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: Devolución del cliente"
            disabled={submitting}
            aria-invalid={touched && !validation.ok}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="text-destructive">{touched && !validation.ok ? validation.message : ""}</span>
            <span>{reason.trim().length}/{CREDIT_NOTE_REASON_MAX_LENGTH}</span>
          </div>
        </div>
        {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={submitting} className="h-10 rounded-lg bg-muted px-4 text-sm font-semibold disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={submit} disabled={submitting} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Emitiendo..." : "Confirmar y emitir"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
