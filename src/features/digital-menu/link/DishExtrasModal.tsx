import { useEffect, useMemo, useState } from "react";
import { calculateLineTotal } from "./lib/cart";
import type { CartExtra, CartLine, LinkMenuExtra, LinkMenuItem } from "./lib/types";

interface DishExtrasModalProps {
  isOpen: boolean;
  onClose: () => void;
  dish: LinkMenuItem | null;
  availableExtras: LinkMenuExtra[];
  currencyCode: string;
  initialQuantity?: number;
  initialNotes?: string;
  initialExtras?: CartExtra[];
  mode?: "add" | "edit";
  onConfirm: (data: { quantity: number; notes: string; extras: CartExtra[] }) => void;
}

const formatCurrency = (value: number, code: string = "DOP") =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: code === "ARS" ? "ARS" : "DOP",
  }).format(value || 0);

export function DishExtrasModal({
  isOpen,
  onClose,
  dish,
  availableExtras,
  currencyCode,
  initialQuantity = 1,
  initialNotes = "",
  initialExtras = [],
  mode = "add",
  onConfirm,
}: DishExtrasModalProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [notes, setNotes] = useState(initialNotes);
  const [selectedExtras, setSelectedExtras] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (isOpen && dish) {
      setQuantity(Math.max(1, initialQuantity));
      setNotes(initialNotes);
      const map = new Map<number, number>();
      for (const ex of initialExtras) {
        if (ex.quantity > 0) {
          map.set(ex.plato_id, ex.quantity);
        }
      }
      setSelectedExtras(map);
    }
  }, [isOpen, dish, initialQuantity, initialNotes, initialExtras]);

  const extrasList: CartExtra[] = useMemo(() => {
    return availableExtras
      .map((ex) => ({
        plato_id: ex.plato_id,
        name: ex.name,
        price: ex.price,
        quantity: selectedExtras.get(ex.plato_id) ?? 0,
      }))
      .filter((ex) => ex.quantity > 0);
  }, [availableExtras, selectedExtras]);

  const lineTotal = useMemo(() => {
    if (!dish) return 0;
    const dummyLine: CartLine = {
      id: "preview",
      plato_id: dish.plato_id,
      name: dish.name,
      price: dish.price,
      quantity,
      extras: extrasList,
    };
    return calculateLineTotal(dummyLine);
  }, [dish, quantity, extrasList]);

  if (!isOpen || !dish) return null;

  function handleExtraQtyChange(platoId: number, delta: number) {
    setSelectedExtras((prev) => {
      const next = new Map(prev);
      const current = next.get(platoId) ?? 0;
      const updated = current + delta;
      if (updated <= 0) {
        next.delete(platoId);
      } else if (updated <= 50) {
        next.set(platoId, updated);
      }
      return next;
    });
  }

  function handleConfirm() {
    onConfirm({
      quantity,
      notes: notes.trim(),
      extras: extrasList,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dish-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-white/10 bg-[#21150f] p-6 shadow-2xl max-h-[90vh] flex flex-col text-[#fff7ed]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 id="dish-modal-title" className="text-xl font-black">
              {dish.name}
            </h2>
            <p className="text-sm font-semibold text-orange-200 mt-1">
              {formatCurrency(dish.price, currencyCode)} c/u
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="size-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {dish.description && (
            <p className="text-sm text-orange-50/70 leading-relaxed">
              {dish.description}
            </p>
          )}

          {/* Quantity selector */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <span className="font-bold text-sm">Cantidad</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Disminuir cantidad"
                className="size-9 rounded-full border border-white/10 bg-white/10 text-white font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer transition hover:bg-white/20"
              >
                −
              </button>
              <span className="w-8 text-center font-black text-lg">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                disabled={quantity >= 50}
                aria-label="Aumentar cantidad"
                className="size-9 rounded-full border border-white/10 bg-white/10 text-white font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer transition hover:bg-white/20"
              >
                +
              </button>
            </div>
          </div>

          {/* Extras list */}
          {availableExtras.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-orange-200">
                Agregar extras
              </h3>
              <div className="space-y-2">
                {availableExtras.map((extra) => {
                  const currentQty = selectedExtras.get(extra.plato_id) ?? 0;
                  return (
                    <div
                      key={extra.plato_id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{extra.name}</p>
                        <p className="text-xs text-orange-200/80">
                          +{formatCurrency(extra.price, currencyCode)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentQty > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleExtraQtyChange(extra.plato_id, -1)}
                              aria-label={`Disminuir ${extra.name}`}
                              className="size-8 rounded-full border border-white/10 bg-white/10 text-white font-bold flex items-center justify-center cursor-pointer transition hover:bg-white/20"
                            >
                              −
                            </button>
                            <span className="w-6 text-center font-bold text-sm">
                              {currentQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleExtraQtyChange(extra.plato_id, 1)}
                              disabled={currentQty >= 50}
                              aria-label={`Aumentar ${extra.name}`}
                              className="size-8 rounded-full border border-white/10 bg-white/10 text-white font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer transition hover:bg-white/20"
                            >
                              +
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleExtraQtyChange(extra.plato_id, 1)}
                            aria-label={`Agregar ${extra.name}`}
                            className="rounded-xl border border-orange-300/30 bg-orange-500/20 px-3 py-1.5 text-xs font-bold text-orange-200 hover:bg-orange-500/30 transition cursor-pointer"
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes input */}
          <div className="space-y-2">
            <label htmlFor="dish-notes-input" className="block text-xs font-bold text-orange-100/70">
              Instrucciones o notas para este plato (opcional)
            </label>
            <textarea
              id="dish-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              maxLength={300}
              placeholder="Ej. Sin cebolla, aderezo aparte..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-orange-300/50 focus:bg-white/10 transition resize-none h-20 text-[#fff7ed] placeholder:text-orange-50/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-orange-100/60 uppercase tracking-wider font-semibold">
              Subtotal
            </p>
            <p className="text-xl font-black text-orange-200">
              {formatCurrency(lineTotal, currencyCode)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-2xl bg-[#ff906d] px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[#24120b] shadow-lg cursor-pointer hover:bg-[#ff825b] transition"
          >
            {mode === "edit" ? "Guardar cambios" : "Agregar al pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
