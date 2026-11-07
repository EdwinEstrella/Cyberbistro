import { Search, Sparkles } from "lucide-react";
import type { Plato, DigitalMenuItem } from "../../hooks/usePublicMenuDishes";

export interface PublicMenuDishesSectionProps {
  isCalendarAssigned: boolean;
  dishSearch: string;
  onDishSearchChange: (val: string) => void;
  filteredPlatosList: Plato[];
  menuItems: DigitalMenuItem[];
  onToggleDishVisibility: (platoId: number, visible: boolean) => void;
  onOpenEditPlato: (plato: Plato) => void;
}

export function PublicMenuDishesSection({
  isCalendarAssigned,
  dishSearch,
  onDishSearchChange,
  filteredPlatosList,
  menuItems,
  onToggleDishVisibility,
  onOpenEditPlato,
}: PublicMenuDishesSectionProps) {
  return (
    <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-border pb-3">
        <div>
          <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
            Carta de Platos en Web (Lista Tradicional)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCalendarAssigned
              ? "Control de visibilidad y personalizaciones de platos (activo si se remueve el calendario)."
              : "Controlá qué platos son visibles en internet y personalizá sus fotos y descripciones públicas."}
          </p>
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar plato o categoría..."
            value={dishSearch}
            onChange={(e) => onDishSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase font-bold tracking-wider text-[10px] sticky top-0 bg-card z-10">
              <th className="py-2.5 pl-3">Plato</th>
              <th className="py-2.5">Categoría</th>
              <th className="py-2.5 text-right">Precio</th>
              <th className="py-2.5 text-center">Visible</th>
              <th className="py-2.5 text-center pr-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredPlatosList.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                  No se encontraron platos para mostrar.
                </td>
              </tr>
            ) : (
              filteredPlatosList.map((plato) => {
                const custom = menuItems.find((mi) => mi.plato_id === plato.id);
                const isVisible = custom ? custom.visible : plato.disponible;
                const isCustomized =
                  custom &&
                  (custom.display_name || custom.description || custom.image_url);

                return (
                  <tr key={plato.id} className="hover:bg-muted/15 transition-colors">
                    <td className="py-2.5 pl-3 font-semibold">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground truncate max-w-[200px]">
                          {custom?.display_name || plato.nombre}
                        </span>
                        {isCustomized && (
                          <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                            <Sparkles className="size-2.5" />
                            Personalizado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-muted-foreground">{plato.categoria}</td>
                    <td className="py-2.5 text-right font-bold text-foreground">
                      {new Intl.NumberFormat("es-DO", {
                        style: "currency",
                        currency: "DOP",
                      }).format(plato.precio)}
                    </td>
                    <td className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={(e) =>
                          onToggleDishVisibility(plato.id, e.target.checked)
                        }
                        className="size-4 rounded accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 text-center pr-3">
                      <button
                        type="button"
                        onClick={() => onOpenEditPlato(plato)}
                        className="bg-muted hover:bg-muted-foreground/15 text-foreground px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Personalizar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
