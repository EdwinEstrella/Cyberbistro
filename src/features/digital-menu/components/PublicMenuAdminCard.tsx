import { RefreshCw } from "lucide-react";
import { usePublicMenuAdmin } from "../hooks/usePublicMenuAdmin";
import { PublicMenuSettingsForm } from "./public-menu/PublicMenuSettingsForm";
import { PublicMenuShareSection } from "./public-menu/PublicMenuShareSection";
import { PublicMenuCalendarSection } from "./public-menu/PublicMenuCalendarSection";
import { PublicMenuDishesSection } from "./public-menu/PublicMenuDishesSection";
import { EditDishDialog } from "./public-menu/EditDishDialog";

export interface PublicMenuAdminCardProps {
  tenantId: string;
  sucursalId?: string | null;
}

export function PublicMenuAdminCard({ tenantId, sucursalId }: PublicMenuAdminCardProps) {
  const admin = usePublicMenuAdmin({ tenantId, sucursalId });

  if (admin.loading) {
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
            onClick={() => void admin.loadData()}
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
            enabled={admin.enabled}
            onEnabledChange={admin.setEnabled}
            slug={admin.slug}
            onSlugChange={admin.setSlug}
            title={admin.title}
            onTitleChange={admin.setTitle}
            description={admin.description}
            onDescriptionChange={admin.setDescription}
            logoUrl={admin.logoUrl}
            onLogoUrlChange={admin.setLogoUrl}
            bannerUrl={admin.bannerUrl}
            onBannerUrlChange={admin.setBannerUrl}
            savingSettings={admin.savingSettings}
            onSubmit={admin.handleSaveSettings}
          />

          <PublicMenuShareSection
            qrCodeDataUrl={admin.qrCodeDataUrl}
            qrUrl={admin.qrUrl}
            copiedLink={admin.copiedLink}
            onCopyLink={admin.handleCopyLink}
            onDownloadQR={admin.handleDownloadQR}
          />
        </div>

        {/* Right Column (7 cols): Calendar & Legacy Dish Management */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PublicMenuCalendarSection
            assignedMenu={admin.assignedMenu}
            menus={admin.menus}
            selectedCalendarMenuId={admin.selectedCalendarMenuId}
            onSelectedCalendarMenuIdChange={admin.setSelectedCalendarMenuId}
            updatingCalendar={admin.updatingCalendar}
            hasSettingsId={Boolean(admin.settings?.id)}
            onAssignCalendar={admin.handleAssignCalendar}
            onRemoveCalendar={admin.handleRemoveCalendar}
            onEditCalendar={admin.handleEditCalendar}
            showCreateMenu={admin.showCreateMenu}
            onOpenCreateMenu={admin.handleOpenCreateMenu}
            onCloseCreateMenu={() => admin.setShowCreateMenu(false)}
            newMenuName={admin.newMenuName}
            onNewMenuNameChange={admin.setNewMenuName}
            newMenuMode={admin.newMenuMode}
            onNewMenuModeChange={admin.setNewMenuMode}
            newMenuWeekStart={admin.newMenuWeekStart}
            onNewMenuWeekStartChange={admin.setNewMenuWeekStart}
            creatingMenu={admin.creatingMenu}
            onCreateAndAssignMenu={admin.handleCreateAndAssignMenu}
          />

          <PublicMenuDishesSection
            isCalendarAssigned={Boolean(admin.assignedMenu)}
            dishSearch={admin.dishSearch}
            onDishSearchChange={admin.setDishSearch}
            filteredPlatosList={admin.filteredPlatosList}
            menuItems={admin.menuItems}
            onToggleDishVisibility={admin.handleToggleDishVisibility}
            onOpenEditPlato={admin.handleOpenEditPlato}
          />
        </div>
      </div>

      {/* Dish Customization Modal */}
      <EditDishDialog
        editingPlato={admin.editingPlato}
        editDisplayName={admin.editDisplayName}
        onEditDisplayNameChange={admin.setEditDisplayName}
        editDescription={admin.editDescription}
        onEditDescriptionChange={admin.setEditDescription}
        editImageUrl={admin.editImageUrl}
        uploadingImage={admin.uploadingImage}
        onImageUpload={admin.handleImageUpload}
        onClose={() => admin.setEditingPlato(null)}
        onSave={admin.handleUpdateDishCustomFields}
      />
    </div>
  );
}
