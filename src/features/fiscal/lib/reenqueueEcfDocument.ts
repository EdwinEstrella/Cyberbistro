type ReenqueueRpcResponse = {
  ok?: boolean;
  outbox_id?: string;
  status?: string;
  idempotent?: boolean;
};

export type FiscalRpcClient = {
  database: {
    rpc: (
      functionName: "cloudix_reenqueue_ecf_document",
      params: {
        p_tenant_id: string;
        p_ecf_document_id: string;
      }
    ) => Promise<{ data: ReenqueueRpcResponse | null; error: unknown }>;
  };
};

export type ReenqueueEcfDocumentResult = {
  ok: boolean;
  outboxId: string | null;
  status: string | null;
  idempotent: boolean;
};

export async function reenqueueEcfDocument({
  client,
  tenantId,
  ecfDocumentId,
}: {
  client: FiscalRpcClient;
  tenantId: string;
  ecfDocumentId: string;
}): Promise<ReenqueueEcfDocumentResult> {
  const { data, error } = await client.database.rpc("cloudix_reenqueue_ecf_document", {
    p_tenant_id: tenantId,
    p_ecf_document_id: ecfDocumentId,
  });

  if (error) throw error;

  return {
    ok: data?.ok === true,
    outboxId: data?.outbox_id ?? null,
    status: data?.status ?? null,
    idempotent: data?.idempotent === true,
  };
}
