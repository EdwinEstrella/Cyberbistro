import { useState } from "react";
import { ServiceRequestButtons } from "./ServiceRequestButtons";
import { ServiceRequestSheet } from "./ServiceRequestSheet";
import { useWaiterAvailability } from "../../hooks/useWaiterAvailability";
import { useServiceRequest } from "../../hooks/useServiceRequest";
import type { ServiceRequestKind } from "../../lib/serviceRequests";

export interface ServiceRequestPanelProps {
  slug: string;
  mesa: number;
  tenantId: string;
}

/**
 * Container component for table-mode service requests.
 * Connects presence availability, the request state machine, buttons and the request bottom sheet.
 */
export function ServiceRequestPanel({
  slug,
  mesa,
  tenantId,
}: ServiceRequestPanelProps) {
  const [activeKind, setActiveKind] = useState<ServiceRequestKind | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const waiterAvailable = useWaiterAvailability(tenantId, true);
  const { status, codeError, generalError, submit, reset } = useServiceRequest({
    slug,
    mesa,
  });

  const handleOpenWaiter = () => {
    reset();
    setActiveKind("waiter");
    setIsSheetOpen(true);
  };

  const handleOpenBill = () => {
    reset();
    setActiveKind("bill");
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    reset();
  };

  const handleSubmit = (code: string) => {
    if (activeKind) {
      void submit(activeKind, code);
    }
  };

  return (
    <>
      <ServiceRequestButtons
        waiterAvailable={waiterAvailable}
        onRequestWaiter={handleOpenWaiter}
        onRequestBill={handleOpenBill}
      />
      <ServiceRequestSheet
        isOpen={isSheetOpen}
        kind={activeKind}
        status={status}
        codeError={codeError}
        generalError={generalError}
        onSubmit={handleSubmit}
        onClose={handleCloseSheet}
      />
    </>
  );
}
