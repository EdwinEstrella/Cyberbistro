import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Plato, DigitalMenuItem, DishCustomFieldsInput } from "../../hooks/usePublicMenuDishes";

export interface EditDishDialogProps {
  editingPlato: Plato | null;
  customItem?: DigitalMenuItem | null;
  uploadingImage?: boolean;
  onImageUpload?: (file: File) => Promise<string | null>;
  onClose: () => void;
  onSubmit: (values: DishCustomFieldsInput) => void | Promise<void>;
}

export function EditDishDialog({
  editingPlato,
  customItem,
  uploadingImage = false,
  onImageUpload,
  onClose,
  onSubmit,
}: EditDishDialogProps) {
  if (!editingPlato) return null;

  const [editDisplayName, setEditDisplayName] = useState(
    customItem?.display_name || editingPlato.nombre
  );
  const [editDescription, setEditDescription] = useState(
    customItem?.description || ""
  );
  const [editImageUrl, setEditImageUrl] = useState(
    customItem?.image_url || ""
  );

  useEffect(() => {
    if (editingPlato) {
      setEditDisplayName(customItem?.display_name || editingPlato.nombre);
      setEditDescription(customItem?.description || "");
      setEditImageUrl(customItem?.image_url || "");
    }
  }, [editingPlato, customItem]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !onImageUpload) return;
    const file = e.target.files[0];
    const url = await onImageUpload(file);
    if (url) {
      setEditImageUrl(url);
    }
  };

  const handleSave = () => {
    void onSubmit({
      displayName: editDisplayName,
      description: editDescription,
      imageUrl: editImageUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl border border-border p-6 max-w-md w-full shadow-2xl flex flex-col gap-5 text-card-foreground">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
              Personalizar Plato en Web
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Modifica los datos que verán los clientes en el menú digital.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Nombre Público
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder={editingPlato.nombre}
              className="w-full px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Descripción del Plato
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Detalla los ingredientes o modo de preparación..."
              className="w-full px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Foto del Plato
            </label>
            <div className="flex items-center gap-3">
              {editImageUrl && (
                <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-border shadow-sm shrink-0 bg-muted aspect-square">
                  <img
                    src={editImageUrl}
                    alt="Vista previa"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                onChange={handleFileChange}
                disabled={uploadingImage}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
              {uploadingImage && (
                <span className="text-xs text-muted-foreground animate-pulse">Subiendo...</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
          >
            Guardar Personalización
          </button>
        </div>
      </div>
    </div>
  );
}
