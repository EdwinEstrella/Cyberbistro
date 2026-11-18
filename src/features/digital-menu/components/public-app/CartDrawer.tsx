import { useEffect, useRef } from "react";
import { X, Trash2, CheckCircle2, ArrowRight, Minus, Plus } from "lucide-react";
import type { CartLine } from "../PublicMenuOrderScreen";
import { publicMenuTheme } from "./publicMenuTheme";
import { DeliveryPicker } from "./DeliveryPicker";
import type { DeliveryDraft } from "../../lib/deliveryOrder";

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartLine[];
  onUpdateQuantity: (platoId: number, quantity: number) => void;
  onClearCart: () => void;
  currency: string;
  isTableMode: boolean;
  mesaNumero?: number;
  itemCount: number;
  total: number;
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
  onDismissSuccess?: () => void;
  currencyFormatter: (value: number, code: string) => string;
  /** Home delivery choice. Optional: without both props the drawer behaves as pickup-only. */
  delivery?: DeliveryDraft;
  onDeliveryChange?: (next: DeliveryDraft) => void;
  /**
   * On wide screens (lg and up) keep the cart permanently visible as a sticky left column instead of a modal
   * overlay. Phones keep the slide-in panel. Without this prop the drawer is always an overlay.
   */
  dockOnDesktop?: boolean;
}

/** Tailwind `lg` breakpoint, where a docked cart stops behaving like a modal. */
const DESKTOP_QUERY = "(min-width: 1024px)";

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onClearCart,
  currency,
  isTableMode,
  mesaNumero,
  itemCount,
  total,
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
  onDismissSuccess,
  currencyFormatter,
  delivery,
  onDeliveryChange,
  dockOnDesktop = false,
}: CartDrawerProps) {
  const isHomeDelivery = !isTableMode && delivery?.mode === "delivery";
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus management and body scroll lock
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isOpen) {
      // A docked cart on a wide screen is part of the page, so it must not lock scrolling or steal focus.
      const isDocked = dockOnDesktop && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;
      if (isDocked) return;

      previousFocusRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
      document.body.style.overflow = "hidden";

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCloseRef.current();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    } else {
      document.body.style.overflow = "";
      if (previousFocusRef.current) {
        previousFocusRef.current.focus?.();
        previousFocusRef.current = null;
      }
    }
  }, [isOpen, dockOnDesktop]);

  if (!isOpen && !dockOnDesktop) return null;

  const handleDismissSuccess = () => {
    onDismissSuccess?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal={isOpen ? true : undefined}
      aria-labelledby="cart-drawer-title"
      style={publicMenuTheme.rootStyle}
      className={`fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 overflow-hidden ${publicMenuTheme.fontClass} ${
        dockOnDesktop
          ? `${isOpen ? "" : "hidden lg:block"} lg:sticky lg:inset-auto lg:top-0 lg:left-auto lg:translate-x-0 lg:h-dvh lg:w-[400px] lg:max-w-none lg:shrink-0 lg:self-start lg:z-10 lg:overflow-visible`
          : ""
      }`}
    >
      {/* Blurred darkened backdrop (overlay mode only) */}
      <div
        data-testid="cart-drawer-backdrop"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${
          dockOnDesktop ? "lg:hidden" : ""
        }`}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        data-testid="cart-drawer-panel"
        className={`absolute right-0 top-0 bottom-0 w-[92vw] sm:w-[88%] max-w-[400px] bg-[#131313] border-l border-[#262626] shadow-2xl flex flex-col z-10 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          dockOnDesktop ? "lg:static lg:h-full lg:w-full lg:max-w-none lg:shadow-none" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#262626] px-4 py-3.5 bg-[#131313] shrink-0">
          <div className="flex items-center gap-2">
            <h2 id="cart-drawer-title" className={`text-base font-bold text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>
              Pedido
            </h2>
            <span className="whitespace-nowrap rounded-full bg-[#2b160d] border border-[#5b2a17] px-2.5 py-0.5 text-[11px] font-bold text-[#ffb59c]">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {cart.length > 0 && !success && (
              <button
                type="button"
                onClick={onClearCart}
                title="Vaciar carrito"
                aria-label="Vaciar carrito"
                className="inline-flex items-center gap-1 rounded-full border border-[#262626] bg-[#1a1a1a] px-3 py-1 text-xs font-semibold text-[#adaaaa] hover:text-red-400 hover:border-red-500/30 transition cursor-pointer active:scale-95"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                <span>Vaciar</span>
              </button>
            )}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar pedido"
              className={`flex size-8 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#262626] text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer active:scale-95 ${
                dockOnDesktop ? "lg:hidden" : ""
              }`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Success View */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="size-16 rounded-full bg-[#59ee50]/10 border border-[#59ee50]/20 text-[#59ee50] flex items-center justify-center shadow-lg">
              <CheckCircle2 className="size-9" />
            </div>
            <div>
              <h3 className={`text-xl font-bold text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>¡Pedido enviado!</h3>
              <p className="mt-1 text-sm text-[#adaaaa]">{success.message}</p>
              {success.numeroPedido !== null && (
                <div className="mt-3 inline-block rounded-full border border-[#59ee50]/20 bg-[#59ee50]/10 px-3 py-1 text-xs font-bold text-[#59ee50]">
                  Pedido #{success.numeroPedido}
                </div>
              )}
            </div>
            <p className="text-xs text-[#adaaaa] max-w-xs leading-relaxed">
              El personal recibió tu comanda y comenzará su preparación de inmediato.
            </p>
            <button
              type="button"
              onClick={handleDismissSuccess}
              className="w-full mt-4 bg-[#ff906d] text-[#5b1600] font-bold rounded-full py-3.5 text-sm hover:bg-[#ffb59c] active:scale-98 transition shadow-sm cursor-pointer"
            >
              Seguir viendo el menú
            </button>
          </div>
        ) : (
          <>
            {/* Scrollable Content: Items + Form Fields */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Item cards */}
              {cart.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-sm font-semibold text-[#fafafa]">Tu pedido está vacío</p>
                  <p className="text-xs text-[#adaaaa]">
                    Elegí platos del menú para armar tu pedido.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((line) => (
                    <div
                      key={line.plato_id}
                      className="rounded-[18px] border border-[#262626] bg-[#1a1a1a] p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold text-[#fafafa] leading-tight ${publicMenuTheme.headingFontClass}`}>
                            {line.name}
                          </p>
                          {line.notes && (
                            <p
                              data-testid={`cart-line-note-${line.plato_id}`}
                              className="mt-0.5 truncate text-[11px] text-[#adaaaa]"
                            >
                              {line.notes}
                            </p>
                          )}
                          <span className="text-[11px] font-semibold text-[#ff906d] tabular-nums">
                            {currencyFormatter(line.price * line.quantity, currency)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(line.plato_id, 0)}
                          aria-label={`Quitar ${line.name}`}
                          className="text-[#adaaaa] hover:text-red-400 transition cursor-pointer p-1"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] font-semibold">
                          Cantidad
                        </span>
                        <div className="flex items-center gap-1.5 rounded-full bg-[#131313] border border-[#262626] p-0.5">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(line.plato_id, line.quantity - 1)}
                            aria-label={`Disminuir ${line.name}`}
                            className="size-6 flex items-center justify-center rounded-full text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626] transition cursor-pointer"
                          >
                            <Minus className="size-3" aria-hidden="true" />
                          </button>
                          <span className="min-w-[18px] text-center text-xs font-bold text-[#fafafa] tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQuantity(line.plato_id, Math.min(99, line.quantity + 1))
                            }
                            disabled={line.quantity >= 99}
                            aria-label={`Aumentar ${line.name}`}
                            className="size-6 flex items-center justify-center rounded-full text-[#adaaaa] hover:text-[#fafafa] hover:bg-[#262626] transition cursor-pointer disabled:opacity-40"
                          >
                            <Plus className="size-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Order fields */}
              {cart.length > 0 && (
                <div className="pt-2 space-y-3 border-t border-[#262626]">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[#adaaaa]">
                    Datos del pedido
                  </p>

                  {/* Table Code Input */}
                  {isTableMode && (
                    <div className="rounded-[16px] border border-[#5b2a17] bg-[#2b160d]/30 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#ffb59c]">
                        <span>Mesa {mesaNumero}</span>
                        <span className="text-[11px] text-[#adaaaa]">Código de 4 dígitos</span>
                      </div>
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
                        aria-label="Código de seguridad de la mesa de 4 dígitos"
                        className="w-full rounded-full bg-[#0e0e0e] border border-[#262626] px-3 py-2 text-center text-xl font-black tracking-[0.5em] text-[#fafafa] outline-none focus:border-[#ff906d]/50 tabular-nums"
                      />
                      {mesaCodeError && (
                        <p className="text-xs text-red-400 font-medium">{mesaCodeError}</p>
                      )}
                    </div>
                  )}

                  {/* Pickup / home delivery: only for public takeout orders, never for tables */}
                  {!isTableMode && delivery && onDeliveryChange && (
                    <DeliveryPicker value={delivery} onChange={onDeliveryChange} />
                  )}

                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => onCustomerNameChange(e.target.value)}
                    placeholder="Tu nombre *"
                    aria-label="Nombre del cliente"
                    className="w-full rounded-full border border-[#262626] bg-[#1a1a1a] px-3.5 py-2.5 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition"
                  />

                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => onCustomerPhoneChange(e.target.value)}
                    placeholder={isHomeDelivery ? "Teléfono para coordinar la entrega *" : "Teléfono (opcional)"}
                    aria-label="Teléfono del cliente"
                    className="w-full rounded-full border border-[#262626] bg-[#1a1a1a] px-3.5 py-2.5 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition"
                  />

                  <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Notas o aclaraciones para cocina..."
                    aria-label="Notas del pedido"
                    rows={2}
                    className="w-full rounded-[16px] border border-[#262626] bg-[#1a1a1a] px-3.5 py-2 text-xs text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition resize-none"
                  />

                  {error && (
                    <div className="rounded-full border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="border-t border-[#262626] bg-[#131313] p-4 space-y-3 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#adaaaa]">
                  <span>Subtotal</span>
                  <span>{currencyFormatter(total, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-[#fafafa]">
                  <span>Total</span>
                  <span className="text-[#ff906d] font-extrabold text-base tabular-nums">
                    {currencyFormatter(total, currency)}
                  </span>
                </div>
              </div>

              {/* Action Button: "Pedir →" - Note: The word "Pagar" is strictly forbidden */}
              <button
                type="button"
                onClick={onPlaceOrder}
                disabled={placing || cart.length === 0}
                className="w-full bg-[#ff906d] text-[#5b1600] font-bold rounded-full py-3 px-4 text-sm flex items-center justify-center gap-2 hover:bg-[#ffb59c] active:scale-98 transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{placing ? "Enviando..." : "Pedir"}</span>
                {!placing && <ArrowRight className="size-4" />}
              </button>

              <p className="text-[10px] text-[#adaaaa] text-center leading-tight">
                El pedido se envía directamente a cocina. Pago directo en el restaurante.
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
