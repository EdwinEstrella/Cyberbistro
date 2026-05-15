interface StaffProvisioningRecoveryInput {
  email: string;
  authUserId: string | null | undefined;
  cause: string;
}

export function buildStaffProvisioningRecoveryMessage({
  email,
  authUserId,
  cause,
}: StaffProvisioningRecoveryInput): string {
  return [
    "No se pudo vincular el miembro al restaurante; la cuenta de Auth puede haber quedado creada y requiere recuperación manual.",
    `Email: ${email}.`,
    `Auth user id: ${authUserId || "no disponible"}.`,
    `Causa: ${cause}`,
  ].join(" ");
}
