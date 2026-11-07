import React from "react";
import { X } from "lucide-react";
import type { Plato } from "../../hooks/usePublicMenuAdmin";

export interface EditDishDialogProps {
  editingPlato: Plato | null;
  editDisplayName: string;
  onEditDisplayNameChange: (val: string) => void;
  editDescription: string;
  onEditDescriptionChange: (val: string) => void;
  editImageUrl: string;
  uploadingImage: boolean;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSave: () => void;
}

export function EditDishDialog({
  editingPlato,
  editDisplayName,
  onEditDisplayNameChange,
  editDescription,
  onEditDescriptionChange,
  editImageUrl,
  uploadingImage,
  onImageUpload,
  onClose,
  onSave,
}: EditDishDialogProps) {
  if (!editingPlato) return null;

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
              onChange={(e) => onEditDisplayNameChange(e.target.value)}
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
              onChange={(e) => onEditDescriptionChange(e.target.value)}
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
                <img
                  src={editImageUrl}
                  alt="Vista previa"
                  className="w-14 h-14 object-cover rounded-xl border border-border shadow-sm shrink-0 bg-muted"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={onImageUpload}
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
            onClick={onSave}
            className="py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
          >
            Guardar Personalización
          </button>
        </div>
      </div>
    </div>
  );
}
