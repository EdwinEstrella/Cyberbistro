import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";
import { processDishPhoto } from "../lib/dishPhotoProcessing";
import { uploadDishPhoto } from "../lib/dishPhotoUpload";
import {
  DishPhotoError,
  dishPhotoErrorMessage,
} from "../lib/dishPhotoErrors";

export interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
  is_extra?: boolean;
  sucursal_id?: string | null;
}

export interface DigitalMenuItem {
  id: string;
  tenant_id: string;
  plato_id: number;
  visible: boolean;
  display_name?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
  updated_at?: string;
}

export interface DishCustomFieldsInput {
  displayName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export interface UsePublicMenuDishesParams {
  tenantId: string;
  initialPlatos: Plato[];
  initialMenuItems: DigitalMenuItem[];
}

export function usePublicMenuDishes({
  tenantId,
  initialPlatos,
  initialMenuItems,
}: UsePublicMenuDishesParams) {
  const [platos, setPlatos] = useState<Plato[]>(initialPlatos);
  const [menuItems, setMenuItems] = useState<DigitalMenuItem[]>(initialMenuItems);
  const [dishSearch, setDishSearch] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    setPlatos(initialPlatos);
  }, [initialPlatos]);

  useEffect(() => {
    setMenuItems(initialMenuItems);
  }, [initialMenuItems]);

  const filteredPlatosList = useMemo(() => {
    return platos.filter((p) => {
      const term = dishSearch.toLowerCase().trim();
      if (!term) return true;
      return (
        p.nombre.toLowerCase().includes(term) ||
        (p.categoria && p.categoria.toLowerCase().includes(term))
      );
    });
  }, [platos, dishSearch]);

  const handleToggleDishVisibility = async (platoId: number, visible: boolean) => {
    if (!tenantId) return;

    try {
      const existingItem = menuItems.find((mi) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload: DigitalMenuItem = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible,
        display_name: existingItem?.display_name || null,
        description: existingItem?.description || null,
        image_url: existingItem?.image_url || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString(),
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload: payload as unknown as Record<string, unknown>,
        deviceId: await getDeviceId(),
      });

      setMenuItems((prev) => {
        const other = prev.filter((mi) => mi.plato_id !== platoId);
        return [...other, payload];
      });
    } catch (err) {
      console.error("Error updating dish visibility:", err);
      toast.error("No se pudo actualizar la visibilidad del plato.");
    }
  };

  const handleUpdateDishCustomFields = async (
    plato: Plato,
    values: DishCustomFieldsInput
  ) => {
    if (!tenantId || !plato) return;

    try {
      const platoId = plato.id;
      const existingItem = menuItems.find((mi) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload: DigitalMenuItem = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible: existingItem ? existingItem.visible : true,
        display_name: values.displayName?.trim() || null,
        description: values.description?.trim() || null,
        image_url: values.imageUrl?.trim() || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString(),
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload: payload as unknown as Record<string, unknown>,
        deviceId: await getDeviceId(),
      });

      setMenuItems((prev) => {
        const other = prev.filter((mi) => mi.plato_id !== platoId);
        return [...other, payload];
      });

      toast.success(`Plato "${plato.nombre}" personalizado.`);
    } catch (err) {
      console.error("Error updating plate custom fields:", err);
      toast.error("No se pudo guardar la personalización del plato.");
    }
  };

  const handleImageUpload = async (file: File, platoId: number): Promise<string | null> => {
    if (!file || !tenantId) return null;

    setUploadingImage(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        toast.error(dishPhotoErrorMessage("missing_token"));
        return null;
      }
      const accessToken = sessionData.session.access_token;

      let processedBlob: Blob;
      try {
        processedBlob = await processDishPhoto(file);
      } catch (err) {
        const code = err instanceof DishPhotoError ? err.code : "unsupported_format";
        toast.error(dishPhotoErrorMessage(code));
        return null;
      }

      try {
        const publicUrl = await uploadDishPhoto({
          blob: processedBlob,
          tenantId,
          platoId,
          accessToken,
        });
        return publicUrl;
      } catch (err) {
        const code = err instanceof DishPhotoError ? err.code : "unknown";
        toast.error(dishPhotoErrorMessage(code));
        return null;
      }
    } catch {
      toast.error(dishPhotoErrorMessage("unknown"));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  return {
    platos,
    menuItems,
    dishSearch,
    setDishSearch,
    filteredPlatosList,
    handleToggleDishVisibility,
    handleUpdateDishCustomFields,
    uploadingImage,
    handleImageUpload,
  };
}
