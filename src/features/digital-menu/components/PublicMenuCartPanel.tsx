import { X, Trash2 } from "lucide-react";
import type { CartLine } from "./PublicMenuOrderScreen";
import { publicMenuTheme } from "./public-app/publicMenuTheme";

export interface PublicMenuCartPanelProps {
  cart: CartLine[];
  onUpdateQuantity: (platoId: number, quantity: number) => void;
  currency: string;
  isTableMode: boolean;
  mesaNumero?: number;
  itemCount: number;
  total: number;
  showMobileCart?: boolean;
  onCloseMobileCart?: () => void;
  mesaCodigo: string;
  onMesaCodigoChange: (code: string) => void;
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
  currencyFormatter: (value: number, currency: string) => string;
}

export function PublicMenuCartPanel({
  cart,
  onUpdateQuantity,
  currency,
  isTableMode,
  mesaNumero,
  itemCount,
  total,
  showMobileCart = false,
  onCloseMobileCart,
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
      <div className="w-full max-h-[85vh] overflow-y-auto rounded-[20px] border border-[#262626] bg-[#131313] p-5 shadow-2xl text-[#fafafa]">
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-bold text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>Tu pedido</h2>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap rounded-full bg-[#2b160d] border border-[#5b2a17] px-2.5 py-0.5 text-xs font-semibold text-[#ffb59c]">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            {showMobileCart && (
              <button
                type="button"
                onClick={onCloseMobileCart}
                aria-label="Cerrar pedido"
                className="flex size-7 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#262626] text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {cart.length === 0 ? (
            <p className="text-xs text-[#adaaaa]">Agregá productos para enviar tu pedido.</p>
          ) : (
            cart.map((line) => (
              <div key={line.plato_id} className="rounded-[16px] border border-[#262626] bg-[#1a1a1a] p-3 space-y-2">
                <div className="flex justify-between gap-3 text-xs font-bold text-[#fafafa]">
                  <span>{line.name}</span>
                  <span className="text-[#ff906d]">{currencyFormatter(line.price * line.quantity, currency)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.plato_id, 0)}
                    aria-label={`Quitar ${line.name}`}
                    className="text-[#adaaaa] hover:text-red-400 transition cursor-pointer p-0.5"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                  <div className="flex items-center gap-1.5 rounded-full bg-[#131313] border border-[#262626] p-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.plato_id, line.quantity - 1)}
                      className="size-6 rounded-full text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626] transition cursor-pointer flex items-center justify-center text-xs"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center text-xs font-bold text-[#fafafa]">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.plato_id, line.quantity + 1)}
                      className="size-6 rounded-full text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626] transition cursor-pointer flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-[#262626] pt-3">
          <div className="flex justify-between text-sm font-bold text-[#fafafa]">
            <span>Total</span>
            <span className="text-[#ff906d] font-extrabold">{currencyFormatter(total, currency)}</span>
          </div>
        </div>

        {/* In-store table code input */}
        {isTableMode && (
          <div className="mt-4 rounded-[16px] bg-[#2b160d]/30 border border-[#5b2a17] p-3 space-y-1.5">
            <p className="text-xs font-semibold text-[#ffb59c]">
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
              className="w-full rounded-full bg-[#0e0e0e] border border-[#262626] px-3 py-2 text-center text-xl font-black tracking-[0.5em] text-[#fafafa] outline-none focus:border-[#ff906d]/50"
            />
            {mesaCodeError && <p className="text-xs text-red-400">{mesaCodeError}</p>}
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          <input
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-full border border-[#262626] bg-[#1a1a1a] px-3.5 py-2.5 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50"
          />
          <input
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="Teléfono"
            type="tel"
            className="w-full rounded-full border border-[#262626] bg-[#1a1a1a] px-3.5 py-2.5 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50"
          />
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notas del pedido"
            rows={2}
            className="w-full rounded-[16px] border border-[#262626] bg-[#1a1a1a] px-3.5 py-2 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 resize-none"
          />
          {error && <p className="rounded-full border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">{error}</p>}
          {success && (
            <div className="rounded-[16px] border border-[#59ee50]/20 bg-[#59ee50]/10 p-2.5">
              <p className="text-xs font-semibold text-[#59ee50]">{success.message}</p>
              {success.numeroPedido !== null && (
                <p className="mt-1 text-[11px] text-[#59ee50] font-bold">Pedido #{success.numeroPedido}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onPlaceOrder}
            disabled={placing || cart.length === 0}
            className="w-full rounded-full bg-[#ff906d] px-4 py-3 text-sm font-bold text-[#5b1600] disabled:opacity-40 transition cursor-pointer hover:bg-[#ffb59c] active:scale-98 shadow-sm"
          >
            {placing ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </aside>
  );
}
