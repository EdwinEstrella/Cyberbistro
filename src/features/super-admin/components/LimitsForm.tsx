import { useMemo } from "react";
import { GitBranch, Users, Save, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../shared/ui/card";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import type { LimitDraft } from "../lib/types";
import { isLimitsFormDirty, validateLimitsDraft } from "../lib/dirtyDetection";
import { formatRoleLabel, type ManagedUserRole } from "../../../shared/lib/tenantUserLimits";

interface LimitsFormProps {
  draft: LimitDraft;
  initialDraft: LimitDraft;
  saving: boolean;
  onChange: (updated: LimitDraft) => void;
  onSave: () => void;
  onReset: () => void;
}

const MANAGED_ROLES: ManagedUserRole[] = ["admin", "cajera", "cocina", "mesero"];

export function LimitsForm({
  draft,
  initialDraft,
  saving,
  onChange,
  onSave,
  onReset,
}: LimitsFormProps) {
  const isDirty = useMemo(
    () => isLimitsFormDirty(draft, initialDraft),
    [draft, initialDraft]
  );

  const validation = useMemo(
    () => validateLimitsDraft(draft),
    [draft]
  );

  const isValid = validation.valid;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Sucursales */}
        <Card className="border border-[rgba(72,72,71,0.18)] bg-[#131313] rounded-[16px]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] p-2.5 bg-[rgba(255,144,109,0.1)] text-[#ff906d]">
                <GitBranch className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="font-['Space_Grotesk',sans-serif] font-bold text-base text-white">
                  Límite de sucursales
                </CardTitle>
                <CardDescription className="text-xs text-[#adaaaa]">
                  Configura la cantidad máxima de sedes autorizadas para operar.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-[12px] border border-[rgba(72,72,71,0.18)] bg-[#1a1a1a] p-3">
              <div className="space-y-0.5">
                <Label htmlFor="sucursal-toggle" className="text-sm font-medium text-white cursor-pointer">
                  Activar control de sucursales
                </Label>
                <p className="text-xs text-[#adaaaa]">
                  Restringe la creación de nuevas sedes al valor configurado.
                </p>
              </div>
              <Switch
                id="sucursal-toggle"
                checked={draft.sucursalLimitEnabled}
                onCheckedChange={(checked) =>
                  onChange({ ...draft, sucursalLimitEnabled: checked })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sucursal-limit-input" className="text-[10px] uppercase tracking-[0.5px] font-['Inter',sans-serif] text-[#adaaaa]">
                Cantidad máxima de sucursales
              </Label>
              <Input
                id="sucursal-limit-input"
                type="number"
                min="1"
                placeholder="Ilimitado"
                value={draft.sucursalLimit}
                disabled={!draft.sucursalLimitEnabled}
                onChange={(e) =>
                  onChange({ ...draft, sucursalLimit: e.target.value })
                }
                className={`rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white focus:border-[#ff906d]/50 ${
                  validation.errors.sucursalLimit ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                }`}
              />
              {validation.errors.sucursalLimit ? (
                <p className="text-xs text-[#ff716c]">{validation.errors.sucursalLimit}</p>
              ) : (
                <p className="text-xs text-[#adaaaa]">
                  Deja el campo vacío si el restaurante cuenta con sucursales ilimitadas.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Usuarios por rol */}
        <Card className="border border-[rgba(72,72,71,0.18)] bg-[#131313] rounded-[16px]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] p-2.5 bg-[rgba(255,144,109,0.1)] text-[#ff906d]">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="font-['Space_Grotesk',sans-serif] font-bold text-base text-white">
                  Usuarios por rol
                </CardTitle>
                <CardDescription className="text-xs text-[#adaaaa]">
                  Establece topes máximos de usuarios activos por cada función operativa.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-[12px] border border-[rgba(72,72,71,0.18)] bg-[#1a1a1a] p-3">
              <div className="space-y-0.5">
                <Label htmlFor="user-limit-toggle" className="text-sm font-medium text-white cursor-pointer">
                  Activar control de cuotas
                </Label>
                <p className="text-xs text-[#adaaaa]">
                  Bloquea la invitación de usuarios cuando se alcance el tope asignado.
                </p>
              </div>
              <Switch
                id="user-limit-toggle"
                checked={draft.userLimitEnabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...draft,
                    userLimitEnabled: checked,
                    adminUserLimit: "1",
                  })
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {MANAGED_ROLES.map((role) => {
                const isAdmin = role === "admin";
                const fieldKey =
                  role === "cajera"
                    ? "cajeraUserLimit"
                    : role === "cocina"
                    ? "cocinaUserLimit"
                    : role === "mesero"
                    ? "meseroUserLimit"
                    : "adminUserLimit";

                const value = isAdmin ? "1" : draft[fieldKey];
                const error = validation.errors[fieldKey];

                return (
                  <div key={role} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`role-limit-${role}`} className="text-[10px] uppercase tracking-[0.5px] font-['Inter',sans-serif] text-[#adaaaa]">
                        {formatRoleLabel(role)}
                      </Label>
                      {isAdmin && (
                        <span className="text-[10px] text-[#adaaaa] font-mono">
                          Fijo (dueño)
                        </span>
                      )}
                    </div>
                    <Input
                      id={`role-limit-${role}`}
                      type="number"
                      min="0"
                      disabled={isAdmin || !draft.userLimitEnabled}
                      placeholder={isAdmin ? "1" : "Ilimitado"}
                      value={value}
                      onChange={(e) => {
                        if (!isAdmin) {
                          onChange({ ...draft, [fieldKey]: e.target.value });
                        }
                      }}
                      className={`rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white focus:border-[#ff906d]/50 ${
                        error ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                      }`}
                    />
                    {error && <p className="text-[11px] text-[#ff716c]">{error}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 rounded-[16px] border border-[rgba(72,72,71,0.25)] bg-[#131313]/95 p-4 shadow-lg backdrop-blur-md">
        <div className="text-xs text-[#adaaaa]">
          {isDirty ? (
            <span className="text-amber-400 font-medium">Hay cambios pendientes sin guardar</span>
          ) : (
            <span>No hay cambios pendientes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={onReset}
              className="gap-1.5 text-xs rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Descartar
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!isDirty || !isValid || saving}
            onClick={onSave}
            className="gap-1.5 text-xs font-bold rounded-[10px] bg-[#ff906d] text-black hover:bg-[#ff8059] disabled:opacity-50 cursor-pointer transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
