import { useRef, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import type { PublicMenuItem } from "../PublicMenuOrderScreen";
import { DishImage } from "../DishImage";
import { getCategoryIcon } from "../../lib/categoryIcons";
import { publicMenuTheme } from "./publicMenuTheme";
import { useSheetDialog } from "../../hooks/useSheetDialog";

export interface DishDetailSheetProps {
  isOpen: boolean;
  item: PublicMenuItem | null;
  onClose: () => void;
  onAddWithDetails: (item: PublicMenuItem, quantity: number, note?: string) => void;
  currency: string;
  currencyFormatter: (value: number, code: string) => string;
  initialNotes?: string;
}

export function DishDetailSheet({
  isOpen,
  item,
  onClose,
  onAddWithDetails,
  currency,
  currencyFormatter,
  initialNotes = "",
}: DishDetailSheetProps) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState(initialNotes ?? "");

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useSheetDialog({
    isOpen: isOpen && Boolean(item),
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen || !item) return null;

  const CategoryIcon = getCategoryIcon(item.category);

  const handleDecrement = () => {
    setQty((current) => Math.max(1, current - 1));
  };

  const handleIncrement = () => {
    setQty((current) => Math.min(99, current + 1));
  };

  const handleAdd = () => {
    const trimmed = note.trim();
    onAddWithDetails(item, qty, trimmed.length > 0 ? trimmed : undefined);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dish-detail-title"
      style={publicMenuTheme.rootStyle}
      className={`fixed inset-0 z-50 flex items-end justify-center ${publicMenuTheme.fontClass}`}
    >
      {/* Backdrop */}
      <div
        data-testid="dish-detail-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        data-testid="dish-detail-panel"
        style={publicMenuTheme.rootStyle}
        className="relative z-10 flex w-full max-w-[480px] max-h-[calc(100dvh-64px)] flex-col rounded-t-[28px] border-t border-[#262626] bg-[#131313] text-[#fafafa] shadow-2xl overflow-hidden"
      >
        {/* Grab handle indicator: 40x5 #3a3a3a */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="h-[5px] w-10 rounded-full bg-[#3a3a3a]" aria-hidden="true" />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Hero 200px, radius 22px, #1a1a1a with close button */}
          <div className="relative h-[200px] w-full rounded-[22px] overflow-hidden bg-[#1a1a1a] border border-[#262626] flex items-center justify-center">
            {item.image_url ? (
              <DishImage
                src={item.image_url}
                alt={item.name}
                className="h-[200px] w-full object-cover rounded-[22px]"
                fallbackClassName="h-[200px] w-full flex items-center justify-center rounded-[22px] bg-[#1a1a1a] text-[#adaaaa]"
              />
            ) : (
              <div
                role="img"
                aria-label={`Sin imagen para ${item.name}`}
                className="h-[200px] w-full flex items-center justify-center rounded-[22px] bg-[#1a1a1a] text-[#adaaaa]"
              >
                <CategoryIcon className="size-16 text-[#ff906d] opacity-40" aria-hidden="true" />
              </div>
            )}

            {/* Close button: 40px round, top-right over hero */}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-[#131313]/80 backdrop-blur-md border border-[#262626] text-[#fafafa] hover:bg-[#1a1a1a] transition cursor-pointer z-10 active:scale-95"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* Name & Price */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h2
                id="dish-detail-title"
                className={`text-2xl font-extrabold text-[#fafafa] leading-tight ${publicMenuTheme.headingFontClass}`}
              >
                {item.name}
              </h2>
              <span className="text-lg font-bold text-[#ff906d] shrink-0 pt-0.5 tabular-nums">
                {currencyFormatter(item.price, currency)}
              </span>
            </div>

            {/* Description only if present */}
            {item.description && (
              <p className="text-sm text-[#adaaaa] leading-relaxed">
                {item.description}
              </p>
            )}
          </div>

          {/* Nota para cocina */}
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor="dish-kitchen-notes"
              className="block text-sm font-bold text-[#fafafa]"
            >
              Nota para cocina
            </label>
            <textarea
              id="dish-kitchen-notes"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej.: sin cebolla, poca sal"
              className="w-full resize-none rounded-[14px] border border-[#262626] bg-[#1a1a1a] p-3 text-sm text-[#fafafa] placeholder-[#adaaaa]/60 focus:border-[#ff906d] focus:outline-hidden transition"
            />
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-10 border-t border-[#262626] bg-[#131313] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex items-center gap-3">
          {/* Quantity stepper pill */}
          <div
            role="group"
            aria-label={`Cantidad de ${item.name}`}
            className="flex items-center rounded-full bg-[#1a1a1a] border border-[#262626] p-1 shrink-0"
          >
            <button
              type="button"
              onClick={handleDecrement}
              disabled={qty <= 1}
              aria-label="Quitar uno"
              className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#262626] text-[#fafafa] hover:bg-[#3a3a3a] active:scale-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span
              data-testid="dish-detail-qty"
              className="min-w-[32px] px-2 text-center text-sm font-bold text-[#fafafa] tabular-nums"
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={qty >= 99}
              aria-label="Agregar uno"
              className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#ff906d] text-[#5b1600] font-bold hover:bg-[#ffb59c] active:scale-90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Full-width primary button */}
          <button
            type="button"
            data-testid="dish-detail-add-btn"
            onClick={handleAdd}
            className="flex-1 flex min-h-[48px] items-center justify-between rounded-full bg-[#fafafa] px-5 py-3 text-sm font-bold text-[#0e0e0e] hover:bg-white active:scale-98 transition shadow-sm cursor-pointer"
          >
            <span>Agregar</span>
            <span className="tabular-nums font-extrabold">
              {currencyFormatter(item.price * qty, currency)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
