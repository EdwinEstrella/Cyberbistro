import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { usePublicMenuAdminData } from "../hooks/usePublicMenuAdminData";
import { usePublicMenuSettings } from "../hooks/usePublicMenuSettings";
import {
  usePublicMenuCalendar,
  type CreateCalendarMenuValues,
} from "../hooks/usePublicMenuCalendar";
import {
  usePublicMenuDishes,
  type Plato,
  type DishCustomFieldsInput,
} from "../hooks/usePublicMenuDishes";
import { usePublicMenuShare } from "../hooks/usePublicMenuShare";
import { PublicMenuSettingsForm } from "./public-menu/PublicMenuSettingsForm";
import { PublicMenuShareSection } from "./public-menu/PublicMenuShareSection";
import { PublicMenuCalendarSection } from "./public-menu/PublicMenuCalendarSection";
import { PublicMenuDishesSection } from "./public-menu/PublicMenuDishesSection";
import { EditDishDialog } from "./public-menu/EditDishDialog";

export interface PublicMenuAdminCardProps {
  tenantId: string;
  sucursalId?: string | null;
  initialEditingPlato?: Plato | null;
}

export function PublicMenuAdminCard({
  tenantId,
  sucursalId,
  initialEditingPlato = null,
}: PublicMenuAdminCardProps) {
  const { loading, data, loadData } = usePublicMenuAdminData({ tenantId, sucursalId });

  const settingsHook = usePublicMenuSettings({
    tenantId,
    sucursalId,
    initialSettings: data.settings,
  });

  const calendarHook = usePublicMenuCalendar({
    tenantId,
    sucursalId,
    initialMenus: data.menus,
    settings: settingsHook.settings,
    onSettingsUpdated: settingsHook.setSettings,
  });

  const dishesHook = usePublicMenuDishes({
    tenantId,
    initialPlatos: data.platos,
    initialMenuItems: data.menuItems,
  });

  const shareHook = usePublicMenuShare({
    slug: settingsHook.form.slug,
  });

  // Dialog-local states kept in container: open/close and entity being edited
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [editingPlato, setEditingPlato] = useState<Plato | null>(initialEditingPlato);

  const handleOpenCreateMenu = () => {
    if (!settingsHook.settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }
    setShowCreateMenu(true);
  };

  const handleCreateAndAssignMenu = async (values: CreateCalendarMenuValues) => {
    const success = await calendarHook.handleCreateAndAssignMenu(values);
    if (success) {
      setShowCreateMenu(false);
    }
  };

  const handleSaveCustomDish = async (values: DishCustomFieldsInput) => {
    if (!editingPlato) return;
    await dishesHook.handleUpdateDishCustomFields(editingPlato, values);
    setEditingPlato(null);
  };

  if (loading) {
    return (
      <div className="p-8 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <span className="text-xs font-semibold font-['Space_Grotesk']">
          Cargando configuración del menú público...
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4 sm:p-6 flex flex-col gap-6">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-foreground tracking-tight">
              Menú público
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Profesional+
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configuración general, enlace web, código QR y calendario de platos para clientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {/* Grid: Left Column (Settings & QR) and Right Column (Calendar & Legacy Dishes) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): General Form & QR */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <PublicMenuSettingsForm
            enabled={settingsHook.form.enabled}
            onEnabledChange={(val) => settingsHook.updateField("enabled", val)}
            slug={settingsHook.form.slug}
            onSlugChange={(val) => settingsHook.updateField("slug", val)}
            title={settingsHook.form.title}
            onTitleChange={(val) => settingsHook.updateField("title", val)}
            description={settingsHook.form.description}
            onDescriptionChange={(val) => settingsHook.updateField("description", val)}
            logoUrl={settingsHook.form.logoUrl}
            onLogoUrlChange={(val) => settingsHook.updateField("logoUrl", val)}
            bannerUrl={settingsHook.form.bannerUrl}
            onBannerUrlChange={(val) => settingsHook.updateField("bannerUrl", val)}
            savingSettings={settingsHook.savingSettings}
            onSubmit={settingsHook.handleSaveSettings}
          />

          <PublicMenuShareSection
            qrCodeDataUrl={shareHook.qrCodeDataUrl}
            qrUrl={shareHook.qrUrl}
            copiedLink={shareHook.copiedLink}
            onCopyLink={shareHook.handleCopyLink}
            onDownloadQR={shareHook.handleDownloadQR}
          />
        </div>

        {/* Right Column (7 cols): Calendar & Legacy Dish Management */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PublicMenuCalendarSection
            assignedMenu={calendarHook.assignedMenu}
            menus={calendarHook.menus}
            selectedCalendarMenuId={calendarHook.selectedCalendarMenuId}
            onSelectedCalendarMenuIdChange={calendarHook.setSelectedCalendarMenuId}
            updatingCalendar={calendarHook.updatingCalendar}
            hasSettingsId={Boolean(settingsHook.settings?.id)}
            onAssignCalendar={calendarHook.handleAssignCalendar}
            onRemoveCalendar={calendarHook.handleRemoveCalendar}
            onEditCalendar={calendarHook.handleEditCalendar}
            showCreateMenu={showCreateMenu}
            onOpenCreateMenu={handleOpenCreateMenu}
            onCloseCreateMenu={() => setShowCreateMenu(false)}
            creatingMenu={calendarHook.creatingMenu}
            onCreateAndAssignMenu={handleCreateAndAssignMenu}
          />

          <PublicMenuDishesSection
            isCalendarAssigned={Boolean(calendarHook.assignedMenu)}
            dishSearch={dishesHook.dishSearch}
            onDishSearchChange={dishesHook.setDishSearch}
            filteredPlatosList={dishesHook.filteredPlatosList}
            menuItems={dishesHook.menuItems}
            onToggleDishVisibility={dishesHook.handleToggleDishVisibility}
            onOpenEditPlato={(plato) => setEditingPlato(plato)}
          />
        </div>
      </div>

      {/* Dish Customization Modal */}
      <EditDishDialog
        editingPlato={editingPlato}
        customItem={dishesHook.menuItems.find((mi) => mi.plato_id === editingPlato?.id)}
        uploadingImage={dishesHook.uploadingImage}
        onImageUpload={(file) =>
          editingPlato ? dishesHook.handleImageUpload(file, editingPlato.id) : Promise.resolve(null)
        }
        onClose={() => setEditingPlato(null)}
        onSubmit={handleSaveCustomDish}
      />
    </div>
  );
}
