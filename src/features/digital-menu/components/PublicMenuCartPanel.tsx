import { X } from "lucide-react";
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
          ? "fixed inset-0 z-50 flex items-end bg-black/75 p-4 sm:p-6 backdrop-blur-sm"
          : "hidden"
      }`}
    >
      <div className="w-full max-h-[85vh] overflow-y-auto rounded-[32px] border border-white/10 bg-[#21150f] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Tu pedido</h2>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            {showMobileCart && (
              <button
                type="button"
                onClick={onCloseMobileCart}
                aria-label="Cerrar pedido"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white lg:hidden cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {cart.length === 0 ? (
            <p className="text-sm text-orange-50/60">Agregá productos para enviar tu pedido.</p>
          ) : (
            cart.map((line) => (
              <div key={line.plato_id} className="rounded-2xl bg-white/[0.06] p-3">
                <div className="flex justify-between gap-3 text-sm font-bold">
                  <span>{line.name}</span>
                  <span>{currencyFormatter(line.price * line.quantity, currency)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.plato_id, line.quantity - 1)}
                    className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer hover:bg-white/10 transition"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.plato_id, line.quantity + 1)}
                    className="size-8 rounded-full border border-white/10 bg-transparent text-white cursor-pointer hover:bg-white/10 transition"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex justify-between text-lg font-black">
            <span>Total</span>
            <span>{currencyFormatter(total, currency)}</span>
          </div>
        </div>

        {/* In-store table code input */}
        {isTableMode && (
          <div className="mt-4 rounded-2xl bg-orange-500/10 border border-orange-300/20 p-3">
            <p className="text-xs font-bold text-orange-200 mb-2">
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
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-center text-2xl font-black tracking-[0.5em] outline-none"
            />
            {mesaCodeError && <p className="mt-2 text-xs text-red-300">{mesaCodeError}</p>}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <input
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
          />
          <input
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="Teléfono"
            type="tel"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notas del pedido"
            className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm outline-none"
          />
          {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
          {success && (
            <div className="rounded-xl bg-emerald-500/15 p-3">
              <p className="text-sm text-emerald-100">{success.message}</p>
              {success.numeroPedido !== null && (
                <p className="mt-1 text-xs text-emerald-200/80">Pedido #{success.numeroPedido}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onPlaceOrder}
            disabled={placing || cart.length === 0}
            className="w-full rounded-2xl border-0 bg-orange-200 px-4 py-4 text-sm font-black uppercase tracking-widest text-[#21150f] disabled:opacity-50 transition cursor-pointer hover:bg-orange-300"
          >
            {placing ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </aside>
  );
}
