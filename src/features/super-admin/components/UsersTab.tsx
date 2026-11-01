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
      <div className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[rgba(72,72,71,0.3)] p-12 text-center bg-[#131313]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-[#adaaaa]">
          <UserX className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-sm text-white">Sin usuarios registrados</h4>
          <p className="max-w-sm text-xs text-[#adaaaa]">
            Este restaurante aún no cuenta con miembros registrados en el sistema.
          </p>
        </div>
      </div>
    );
  }

  const getRoleBadgeVariant = (rol: string) => {
    switch (rol) {
      case "admin":
        return "border border-purple-500/30 bg-purple-500/10 text-purple-400 rounded-full";
      case "cajera":
        return "border border-[rgba(89,238,80,0.3)] bg-[rgba(89,238,80,0.1)] text-[#59ee50] rounded-full";
      case "cocina":
        return "border border-amber-500/30 bg-amber-500/10 text-amber-400 rounded-full";
      case "mesero":
        return "border border-blue-500/30 bg-blue-500/10 text-blue-400 rounded-full";
      default:
        return "border border-[rgba(72,72,71,0.3)] bg-[rgba(255,255,255,0.05)] text-[#adaaaa] rounded-full";
    }
  };

  return (
    <div className="space-y-4">
      {/* Table view for >= md */}
      <div className="hidden md:block overflow-hidden rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[rgba(72,72,71,0.18)] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Email</TableHead>
              <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Nombre</TableHead>
              <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Rol</TableHead>
              <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Estado</TableHead>
              <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Autenticación</TableHead>
              <TableHead className="text-right font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isAdmin = user.rol === "admin";
              const isActive = user.activo !== false;
              const isDeleting = rowActionId === user.id;

              return (
                <TableRow key={user.id} className="border-b border-[rgba(72,72,71,0.15)] hover:bg-[#1a1a1a]/60 transition-colors">
                  <TableCell className="font-medium text-white">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-[#adaaaa] shrink-0" />
                      <span>{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#adaaaa]">
                    {user.nombre || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium capitalize px-2.5 ${getRoleBadgeVariant(user.rol)}`}
                    >
                      {isAdmin ? "Admin dueño" : formatRoleLabel(user.rol as ManagedUserRole) || user.rol}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`gap-1.5 text-[11px] font-medium px-2.5 rounded-full ${
                        isActive
                          ? "border border-[rgba(89,238,80,0.3)] bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                          : "border border-[rgba(255,113,108,0.3)] bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isActive ? "bg-[#59ee50]" : "bg-[#ff716c]"
                        }`}
                      />
                      {isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-[#adaaaa]">
                    {user.auth_user_id ? (
                      <span className="text-[#59ee50] font-medium">Vinculado</span>
                    ) : (
                      <span className="text-amber-400/80">Pendiente</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#adaaaa] font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                        Protegido
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => onDeleteUser(user)}
                        className="h-8 gap-1 text-xs rounded-[10px] border border-[rgba(255,113,108,0.3)] text-[#ff716c] hover:bg-[rgba(255,113,108,0.1)] hover:text-white cursor-pointer"
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
              className="flex flex-col gap-3 rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-white text-sm">
                    {user.email}
                  </div>
                  {user.nombre && (
                    <div className="text-xs text-[#adaaaa]">{user.nombre}</div>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase font-semibold shrink-0 px-2 rounded-full ${getRoleBadgeVariant(user.rol)}`}
                >
                  {isAdmin ? "Admin dueño" : formatRoleLabel(user.rol as ManagedUserRole) || user.rol}
                </Badge>
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(72,72,71,0.18)] pt-2.5 text-xs text-[#adaaaa]">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isActive ? "bg-[#59ee50]" : "bg-[#ff716c]"
                    }`}
                  />
                  <span>{isActive ? "Activo" : "Inactivo"}</span>
                  <span>•</span>
                  <span>{user.auth_user_id ? "Vinculado" : "Pendiente"}</span>
                </div>

                {isAdmin ? (
                  <span className="flex items-center gap-1 text-[11px] text-[#adaaaa] font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                    Protegido
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => onDeleteUser(user)}
                    className="h-7 px-2 text-xs rounded-[10px] border border-[rgba(255,113,108,0.3)] text-[#ff716c] hover:bg-[rgba(255,113,108,0.1)] hover:text-white cursor-pointer"
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
