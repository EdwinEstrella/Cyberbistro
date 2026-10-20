export interface ReceivedDocumentEvidence {
  id: string;
  tenant_id: string;
  emisor_rnc: string | null;
  comprador_rnc: string | null;
  encf: string | null;
  tipo_ecf: string | number | null;
  estado: number | null;
  motivo_no_recibido: string | number | null;
  received_at: string | null;
  signer_rnc_mismatch: boolean | null;
}

export interface ReceivedApprovalEvidence {
  id: string;
  tenant_id: string;
  emisor_rnc: string | null;
  comprador_rnc: string | null;
  encf: string | null;
  estado: number | null;
  detalle_motivo_rechazo: string | null;
  received_at: string | null;
  signer_rnc_mismatch: boolean | null;
}

export interface ReceivedEvidenceSummary {
  acceptedDocuments: number;
  rejectedDocuments: number;
  approvedApprovals: number;
  rejectedApprovals: number;
}

export interface CertificationStepEvidence {
  applies: boolean;
  satisfied: boolean;
}

export interface ReceivedEvidenceResult {
  docs: ReceivedDocumentEvidence[];
  approvals: ReceivedApprovalEvidence[];
  error: string | null;
}

/** Minimal slice of the Supabase client used by the loader. */
export interface ReceivedEvidenceClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
        };
      };
    };
  };
}

export const RECEIVED_EVIDENCE_LIMIT = 50;

const DOCUMENT_COLUMNS = "id, tenant_id, emisor_rnc, comprador_rnc, encf, tipo_ecf, estado, motivo_no_recibido, received_at, signer_rnc_mismatch";
const APPROVAL_COLUMNS = "id, tenant_id, emisor_rnc, comprador_rnc, encf, estado, detalle_motivo_rechazo, received_at, signer_rnc_mismatch";

export function summarizeReceivedEvidence(
  docs: ReadonlyArray<Pick<ReceivedDocumentEvidence, "estado">>,
  approvals: ReadonlyArray<Pick<ReceivedApprovalEvidence, "estado">>,
): ReceivedEvidenceSummary {
  return {
    acceptedDocuments: docs.filter((doc) => doc.estado === 0).length,
    rejectedDocuments: docs.filter((doc) => doc.estado !== 0).length,
    approvedApprovals: approvals.filter((approval) => approval.estado === 1).length,
    rejectedApprovals: approvals.filter((approval) => approval.estado === 2).length,
  };
}

/** Steps 8/9 need a received e-CF; steps 10/11 need a received commercial approval (ACECF). */
export function certificationStepEvidence(step: number, summary: ReceivedEvidenceSummary): CertificationStepEvidence {
  if (step === 8 || step === 9) return { applies: true, satisfied: summary.acceptedDocuments >= 1 };
  if (step === 10 || step === 11) {
    return { applies: true, satisfied: summary.approvedApprovals + summary.rejectedApprovals >= 1 };
  }
  return { applies: false, satisfied: true };
}

export async function loadReceivedEvidence(client: ReceivedEvidenceClient, tenantId: string): Promise<ReceivedEvidenceResult> {
  try {
    const [docsResult, approvalsResult] = await Promise.all([
      client.from("ecf_received_documents").select(DOCUMENT_COLUMNS).eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(RECEIVED_EVIDENCE_LIMIT),
      client.from("ecf_received_approvals").select(APPROVAL_COLUMNS).eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(RECEIVED_EVIDENCE_LIMIT),
    ]);
    const failure = docsResult.error ?? approvalsResult.error;
    return {
      docs: (docsResult.data ?? []) as ReceivedDocumentEvidence[],
      approvals: (approvalsResult.data ?? []) as ReceivedApprovalEvidence[],
      error: failure ? failure.message || "No se pudo leer lo recibido." : null,
    };
  } catch (error) {
    return { docs: [], approvals: [], error: error instanceof Error ? error.message : "No se pudo leer lo recibido." };
  }
}
