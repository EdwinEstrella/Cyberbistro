import { UserX, ShieldCheck, Trash2, Mail } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../../shared/ui/table";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import type { TenantUserRow } from "../lib/types";
import { formatRoleLabel, type ManagedUserRole } from "../../../shared/lib/tenantUserLimits";

interface UsersTabProps {
  users: TenantUserRow[];
  onDeleteUser: (user: TenantUserRow) => void;
  rowActionId: string | null;
}

export function UsersTab({ users, onDeleteUser, rowActionId }: UsersTabProps) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 p-12 text-center bg-card/30">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <UserX className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Sin usuarios registrados</h4>
          <p className="max-w-sm text-xs text-muted-foreground">
            Este restaurante aún no cuenta con miembros registrados en el sistema.
          </p>
        </div>
      </div>
    );
  }

  const getRoleBadgeVariant = (rol: string) => {
    switch (rol) {
      case "admin":
        return "border-purple-500/30 bg-purple-500/10 text-purple-400";
      case "cajera":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
      case "cocina":
        return "border-amber-500/30 bg-amber-500/10 text-amber-400";
      case "mesero":
        return "border-blue-500/30 bg-blue-500/10 text-blue-400";
      default:
        return "border-muted bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      {/* Table view for >= md */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs font-semibold text-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Nombre</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Rol</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Estado</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Autenticación</TableHead>
              <TableHead className="text-right text-xs font-semibold text-foreground">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isAdmin = user.rol === "admin";
              const isActive = user.activo !== false;
              const isDeleting = rowActionId === user.id;

              return (
                <TableRow key={user.id} className="border-border/40 hover:bg-muted/20">
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.nombre || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium capitalize ${getRoleBadgeVariant(user.rol)}`}
                    >
                      {isAdmin ? "Admin dueño" : formatRoleLabel(user.rol as ManagedUserRole) || user.rol}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`gap-1.5 text-[11px] ${
                        isActive
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isActive ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                      {isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.auth_user_id ? (
                      <span className="text-emerald-400/90 font-medium">Vinculado</span>
                    ) : (
                      <span className="text-amber-400/80">Pendiente</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                        Protegido
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => onDeleteUser(user)}
                        className="h-8 gap-1 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isDeleting ? "Eliminando..." : "Eliminar"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Stacked card view for < md */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {users.map((user) => {
          const isAdmin = user.rol === "admin";
          const isActive = user.activo !== false;
          const isDeleting = rowActionId === user.id;

          return (
            <div
              key={user.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground text-sm">
                    {user.email}
                  </div>
                  {user.nombre && (
                    <div className="text-xs text-muted-foreground">{user.nombre}</div>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase font-semibold shrink-0 ${getRoleBadgeVariant(user.rol)}`}
                >
                  {isAdmin ? "Admin dueño" : formatRoleLabel(user.rol as ManagedUserRole) || user.rol}
                </Badge>
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isActive ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span>{isActive ? "Activo" : "Inactivo"}</span>
                  <span>•</span>
                  <span>{user.auth_user_id ? "Vinculado" : "Pendiente"}</span>
                </div>

                {isAdmin ? (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                    Protegido
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => onDeleteUser(user)}
                    className="h-7 px-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {isDeleting ? "..." : "Eliminar"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
