import { X, Trash2 } from "lucide-react";
import type { CartLine } from "./PublicMenuOrderScreen";

export interface PublicMenuCartPanelProps {
  cart: CartLine[];
  currency: string;
  isTableMode: boolean;
  mesaNumero?: number;
  itemCount: number;
  total: number;
  showMobileCart: boolean;
  onCloseMobileCart: () => void;
  onUpdateQuantity: (platoId: number, quantity: number) => void;
  mesaCodigo: string;
  onMesaCodigoChange: (val: string) => void;
  mesaCodeError: string | null;
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  error: string | null;
  success: { message: string; numeroPedido: number | null } | null;
  placing: boolean;
  onPlaceOrder: () => void;
  currencyFormatter: (value: number, code: string) => string;
}

export function PublicMenuCartPanel({
  cart,
  currency,
  isTableMode,
  mesaNumero,
  itemCount,
  total,
  showMobileCart,
  onCloseMobileCart,
  onUpdateQuantity,
  mesaCodigo,
  onMesaCodigoChange,
  mesaCodeError,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  notes,
  onNotesChange,
  error,
  success,
  placing,
  onPlaceOrder,
  currencyFormatter,
}: PublicMenuCartPanelProps) {
  return (
    <aside
      className={`lg:sticky lg:top-6 lg:self-start lg:block ${
        showMobileCart
          ? "fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:p-6 backdrop-blur-sm"
          : "hidden"
      }`}
    >
      <div className="w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-[#27272a] bg-[#111113] p-5 shadow-2xl text-zinc-100">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Tu pedido</h2>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            {showMobileCart && (
              <button
                type="button"
                onClick={onCloseMobileCart}
                aria-label="Cerrar pedido"
                className="flex size-7 items-center justify-center rounded-lg bg-[#18181b] border border-[#27272a] text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {cart.length === 0 ? (
            <p className="text-xs text-zinc-500">Agregá productos para enviar tu pedido.</p>
          ) : (
            cart.map((line) => (
              <div key={line.plato_id} className="rounded-xl border border-[#27272a] bg-[#18181b] p-3 space-y-2">
                <div className="flex justify-between gap-3 text-xs font-bold text-white">
                  <span>{line.name}</span>
                  <span className="text-emerald-400">{currencyFormatter(line.price * line.quantity, currency)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.plato_id, 0)}
                    aria-label={`Quitar ${line.name}`}
                    className="text-zinc-500 hover:text-red-400 transition cursor-pointer p-0.5"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <div className="flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-[#27272a] p-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.plato_id, line.quantity - 1)}
                      className="size-6 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition cursor-pointer flex items-center justify-center text-xs"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center text-xs font-bold text-white">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.plato_id, line.quantity + 1)}
                      className="size-6 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition cursor-pointer flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-[#27272a] pt-3">
          <div className="flex justify-between text-sm font-bold text-white">
            <span>Total</span>
            <span className="text-emerald-400 font-extrabold">{currencyFormatter(total, currency)}</span>
          </div>
        </div>

        {/* In-store table code input */}
        {isTableMode && (
          <div className="mt-4 rounded-xl bg-emerald-400/5 border border-emerald-400/20 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-400">
              Mesa {mesaNumero} — Ingresá el código de 4 dígitos
            </p>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              value={mesaCodigo}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                onMesaCodigoChange(val);
              }}
              placeholder="0000"
              className="w-full rounded-lg bg-[#0b0b0d] border border-[#27272a] px-3 py-2 text-center text-xl font-black tracking-[0.5em] text-white outline-none focus:border-emerald-400/50"
            />
            {mesaCodeError && <p className="text-xs text-red-400">{mesaCodeError}</p>}
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          <input
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50"
          />
          <input
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="Teléfono"
            type="tel"
            className="w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50"
          />
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notas del pedido"
            rows={2}
            className="w-full rounded-xl border border-[#27272a] bg-[#18181b] px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 resize-none"
          />
          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">{error}</p>}
          {success && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2.5">
              <p className="text-xs font-semibold text-emerald-300">{success.message}</p>
              {success.numeroPedido !== null && (
                <p className="mt-1 text-[11px] text-emerald-400 font-bold">Pedido #{success.numeroPedido}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onPlaceOrder}
            disabled={placing || cart.length === 0}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40 transition cursor-pointer hover:bg-zinc-100 active:scale-98 shadow-sm"
          >
            {placing ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </aside>
  );
}
